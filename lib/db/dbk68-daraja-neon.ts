import 'server-only';
import { dbk62GetProductionSql, dbk62CutoverRequested } from '@/lib/db/dbk62-pos-cutover';
import { prepareDBK68MpesaSale, type PosSaleInput, type PosSeller } from '@/lib/pos/server';
import { callbackMetadata, darajaAccountReference, darajaTransactionDate,
  initiateDarajaStkPush, queryDarajaStkStatus, type DarajaStkCallbackPayload } from '@/lib/mpesa/daraja';
import { dbk68Kes, dbk68Summary, dbk68ValidReference, dbk68IsOrderId, dbk68PaymentProofMatches,
  type DBK68Order } from '@/lib/db/dbk68-daraja-core';

export function dbk68Requested() {
  return dbk62CutoverRequested() && process.env.DBK68_MPESA_BACKEND==='neon';
}
export function dbk68ReadEnabled() {
  return dbk68Requested() || process.env.DBK68_MPESA_READS==='YES' || process.env.DBK68_MPESA_SETTLEMENT==='YES';
}
function sqlFor(operation:'create'|'settle'|'read'='create') {
  const allowed=operation==='create'?dbk68Requested()
    :operation==='settle'?(dbk68Requested()||process.env.DBK68_MPESA_SETTLEMENT==='YES')
    :dbk68ReadEnabled();
  if (!allowed || process.env.DBK68_CUTOVER_APPROVED!=='YES') throw new Error('DBK-68 disabled');
  return dbk62GetProductionSql();
}
export async function dbk68GetReference(ref:string):Promise<DBK68Order|null> {
  if (!dbk68ValidReference(ref)) return null;
  const sql=sqlFor('read');
  const rows=await sql`SELECT * FROM public.dbk68_daraja_orders WHERE reference=${ref} LIMIT 1`;
  return rows[0] as unknown as DBK68Order||null;
}
async function getCheckout(checkout:string):Promise<DBK68Order|null> {
  const sql=sqlFor('read');
  const rows=await sql`SELECT * FROM public.dbk68_daraja_orders WHERE checkout_id=${checkout} LIMIT 1`;
  return rows[0] as unknown as DBK68Order||null;
}
function safeState(order:DBK68Order) {
  const s=dbk68Summary(order);
  return { ...s,displayText:order.payment_status==='STARTING'
    ? 'M-PESA request may already have been sent. Do not send another prompt; reconcile this request.'
    :order.payment_status==='PAID'?'Payment already verified.'
      :order.payment_status==='INIT_FAILED'?'Request failed before STK confirmation. Reconcile before trying again.'
        :'Ask the customer to complete the M-PESA prompt.',
    reconciliationRequired:order.payment_status==='STARTING'||order.stock_status==='REVIEW_REQUIRED',
    testMode:(process.env.MPESA_ENV||'production').toLowerCase()==='sandbox',
  };
}
export async function dbk68CreateSale(input:PosSaleInput,seller:PosSeller) {
  if (!dbk68Requested()) throw new Error('Neon Direct M-PESA is disabled');
  if (!dbk68ValidReference(`DBK-POS-${input.requestId||''}`)) throw new Error('Invalid POS request ID');
  const reference=`DBK-POS-${input.requestId}`;
  const prior=await dbk68GetReference(reference);
  if (prior) {
    if (prior.store_id!==seller.storeLocationId || input.paymentMethod!=='mpesa') {
      throw new Error('Order location or payment method changed');
    }
    return safeState(prior);
  }
  const snapshot=await prepareDBK68MpesaSale(input,seller);
  const sql=sqlFor('create');
  await sql`SELECT public.dbk68_create_pending(${JSON.stringify(snapshot)}::jsonb)`;
  const claim=await sql`SELECT public.dbk68_claim_stk(${reference}) AS claimed`;
  if (claim[0]?.claimed!==true) {
    const current=await dbk68GetReference(reference);
    if (!current) throw new Error('Pending M-PESA record missing');
    return safeState(current);
  }
  // An ambiguous STK network error leaves STARTING permanently; NEVER auto-retry.
  // This prevents duplicate customer prompts on a retry of the same requestId.
  let stk:Awaited<ReturnType<typeof initiateDarajaStkPush>>;
  try {
    stk=await initiateDarajaStkPush({
      phone:snapshot.customerPhone,amount:snapshot.totalMinor/100,
      accountReference:darajaAccountReference(reference),
    });
  } catch (cause) {
    console.error('[DBK68] STK initiation uncertain; operator review required',cause);
    const pending=await dbk68GetReference(reference);
    if (!pending) throw new Error('STK initiation uncertain. Manual reconciliation required.');
    return {...safeState(pending),displayText:'STK initiation is uncertain. Do not send a second prompt. Reconcile with Safaricom.'};
  }
  try {
    await sql`SELECT public.dbk68_attach_stk(${reference},${stk.checkoutRequestId},${stk.merchantRequestId})`;
  } catch (cause) {
    console.error('[DBK68] STK accepted but checkout ID could not be persisted',{
      reference,checkoutRequestId:stk.checkoutRequestId,cause});
    const pending=await dbk68GetReference(reference);
    if (!pending) throw new Error('STK accepted but database reconciliation required');
    return {...safeState(pending),displayText:'M-PESA prompt sent; checkout ID needs operator reconciliation. Do not resend.'};
  }
  const current=await dbk68GetReference(reference);
  if (!current) throw new Error('STK accepted; pending record requires reconciliation');
  return {...safeState(current),displayText:stk.customerMessage};
}

async function verifyKnownCallback(order:DBK68Order,payload:DarajaStkCallbackPayload) {
  if (!order.checkout_id || !order.merchant_id) throw new Error('Unlinked STK cannot be settled');
  const cb=callbackMetadata(payload);
  if (cb.checkoutRequestId!==order.checkout_id || cb.merchantRequestId!==order.merchant_id) {
    throw new Error('Daraja callback merchant/checkout mismatch');
  }
  // Callback is not signed: Safaricom's authenticated STK Query is required.
  const verified=await queryDarajaStkStatus(order.checkout_id);
  const result=Number(verified.ResultCode);
  if (!verified.CheckoutRequestID || verified.CheckoutRequestID!==order.checkout_id ||
      (verified.MerchantRequestID && verified.MerchantRequestID!==order.merchant_id)) {
    throw new Error('STK Query identifiers do not match the pending order');
  }
  const sql=sqlFor('settle');
  if (result===0 && cb.resultCode===0) {
    if (!dbk68PaymentProofMatches({
      callbackCheckout:cb.checkoutRequestId,expectedCheckout:order.checkout_id,
      callbackMerchant:cb.merchantRequestId,expectedMerchant:order.merchant_id,
      callbackPhone:cb.phone,expectedPhone:order.phone,
      callbackAmount:cb.amount,expectedAmountMinor:Number(order.amount_minor),
      callbackReceipt:cb.receiptNumber,callbackResult:cb.resultCode,queryResult:result,
      queryCheckout:verified.CheckoutRequestID,queryMerchant:verified.MerchantRequestID,
      transactionDate:cb.transactionDate,
    })) {
      throw new Error('Confirmed M-PESA response missing matching receipt, phone, amount or date');
    }
    const proof={checkoutId:order.checkout_id,merchantId:order.merchant_id,
      receipt:cb.receiptNumber,amountMinor:Number(order.amount_minor),phone:cb.phone,
      paidAt:darajaTransactionDate(cb.transactionDate),queryResultCode:0};
    const rows=await sql`SELECT public.dbk68_settle_verified(${order.reference},${JSON.stringify(proof)}::jsonb) AS result`;
    return {matched:true,state:'paid' as const,order:dbk68Summary((await dbk68GetReference(order.reference))!),
      settlement:rows[0]?.result};
  }
  if (Number.isInteger(result) && result!==0 && cb.resultCode!==0 && cb.resultCode===result) {
    await sql`SELECT public.dbk68_mark_failed(${order.reference},${order.checkout_id},${result},${cb.resultDescription})`;
    return {matched:true,state:'failed' as const};
  }
  // Provider still pending, or callback disagrees with provider: no financial mutation.
  return {matched:true,state:'pending' as const};
}
export async function dbk68HandleCallback(payload:DarajaStkCallbackPayload) {
  if (!dbk68ReadEnabled() || process.env.DBK68_CUTOVER_APPROVED!=='YES') return {matched:false};
  const cb=callbackMetadata(payload);
  if (!cb.checkoutRequestId || cb.checkoutRequestId.length>150) return {matched:false};
  const order=await getCheckout(cb.checkoutRequestId);
  if (!order) return {matched:false};
  const sql=sqlFor('settle');
  // Keep the callback for later recovery even if provider query is temporarily unavailable.
  await sql`SELECT public.dbk68_note_callback(${order.checkout_id},${JSON.stringify(payload)}::jsonb)`;
  return verifyKnownCallback(order,payload);
}
export async function dbk68Verify(reference:string,allowedStoreId?:string) {
  if (!dbk68ValidReference(reference)) return null;
  const order=await dbk68GetReference(reference);
  if (!order) return null;
  if (allowedStoreId && allowedStoreId!==order.store_id) throw new Error('Unauthorized order location');
  if (order.payment_status==='PENDING' && order.callback_json) {
    try { await verifyKnownCallback(order,order.callback_json as DarajaStkCallbackPayload); }
    catch (e) { console.error('[DBK68] payment requires provider reconciliation',e); }
  }
  const latest=(await dbk68GetReference(reference))||order;
  const s=dbk68Summary(latest);
  const state=latest.payment_status==='PAID'?'paid':latest.payment_status==='FAILED'?'failed':'pending';
  return {state,order:s,message:state==='paid'?(s.inventoryReviewRequired
    ?'Payment confirmed. Inventory requires review; do not dispatch.':'Safaricom payment verified.')
    :state==='failed'?'Safaricom payment failed.':'Payment pending provider verification; do not retry this STK.'};
}
export async function dbk68ReadReceipt(id:string) {
  if (!dbk68IsOrderId(id)) return null;
  const sql=sqlFor('read');
  const rows=await sql`SELECT * FROM public.dbk68_daraja_orders WHERE order_id=${id} LIMIT 1`;
  const row=rows[0] as unknown as DBK68Order|undefined;
  if (!row) return null;
  const s=dbk68Summary(row);
  return {...s,_id:s.orderId,subtotal:dbk68Kes(row.snapshot.subtotalMinor),
    discountAmount:dbk68Kes(row.snapshot.discountMinor),
    paymentReference:row.reference,fulfilmentType:'IN_STORE' as const,
    receiptNumber:s.receiptNumber,providerReceiptNumber:row.receipt_number||'',
    businessName:'Decor by Kasiwa',businessEmail:'',businessPhone:'',businessWebsite:'decorbykasiwa.co.ke'};
}
export async function dbk68ListHistory() {
  const sql=sqlFor('read');
  const rows=await sql`SELECT * FROM public.dbk68_daraja_orders ORDER BY created_at DESC LIMIT 500`;
  return (rows as unknown as DBK68Order[]).map(o=>{
    const s=dbk68Summary(o);
    return {id:s.orderId,orderNumber:s.orderNumber,receiptNumber:s.receiptNumber,
      customerName:s.customerName,customerPhone:s.customerPhone,salesChannel:'POS' as const,
      soldByName:s.soldByName,soldAt:s.soldAt,paymentStatus:s.paymentStatus,
      paymentChannel:'mobile_money',subtotal:dbk68Kes(o.snapshot.subtotalMinor),
      discountAmount:dbk68Kes(o.snapshot.discountMinor),total:s.total,amountPaid:s.amountPaid,
      balanceDue:s.balanceDue,deliveryFee:0,deliveryLocation:'',refundedAmount:0,
      paymentReference:s.reference,paymentProvider:'daraja',
      providerReceiptNumber:o.receipt_number||'',storeLocationId:o.store_id,
      storeLocationName:'',lineItems:s.lineItems};
  });
}
