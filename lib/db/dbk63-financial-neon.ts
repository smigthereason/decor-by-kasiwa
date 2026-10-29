import 'server-only';
import { dbk62GetProductionSql, dbk62ReadRealOrder, dbk62CutoverRequested } from '@/lib/db/dbk62-pos-cutover';
import { externalReference, moneyMinor, normalizeRefundLines, realOrderId, stableKey } from '@/lib/db/dbk63-financial-core';
import { mapDBK62History } from '@/lib/db/dbk62-pos-mapper';
import type { PosSeller } from '@/lib/pos/server';

/** Writes require DBK-62 app/DB gates AND an independent DBK-63 SQL gate. */
function requireWrite() {
  if (!dbk62CutoverRequested()) throw new Error('Neon financial writes disabled');
  return dbk62GetProductionSql();
}
function verifySeller(seller:PosSeller, storeId:string) {
  if (!seller.id || !['ADMIN','STORE','MANAGER'].includes(seller.role)) throw new Error('Not authorized for Neon financial operations');
  if (seller.role==='MANAGER' && (!seller.storeLocationId || seller.storeLocationId!==storeId)) throw new Error('Not authorized for this store');
  if (seller.role==='STORE' && (!seller.storeLocationId || seller.storeLocationId!==storeId)) throw new Error('Not authorized for this store');
}
function requireReal(inputId:unknown) {
  if (!realOrderId(inputId)) throw new Error('A real Neon POS order is required');
  return inputId;
}

export async function dbk63RecordReceivable(input:{orderId?:string;amount?:number;requestId?:string;paymentReference?:string;manualPaymentConfirmed?:boolean},seller:PosSeller) {
  const sql=requireWrite();
  const orderId=requireReal(input.orderId);
  const order=await dbk62ReadRealOrder(orderId);
  if (!order) throw new Error('Neon POS order not found');
  verifySeller(seller,order.store_id);
  if (!externalReference(input.paymentReference) || input.manualPaymentConfirmed!==true ||
      typeof input.requestId!=='string' || !/^[A-Za-z0-9._-]{8,100}$/.test(input.requestId)) {
    throw new Error('Confirm the external payment and supply its unique reference and request ID');
  }
  const amountMinor=moneyMinor(input.amount);
  const eventKey=stableKey('payment',orderId,input.requestId);
  const payment={orderId,provider:'manual',providerReference:input.paymentReference,
    purpose:'RECEIVABLE',amountMinor,evidenceReference:`cashier-confirmed-${eventKey.slice(-32)}`};
  const rows=await sql`SELECT public.dbk63_record_receivable(${eventKey},${JSON.stringify(payment)}::jsonb) AS result`;
  const result=rows[0]?.result as Record<string,unknown>|undefined;
  if (!result || result.orderId!==orderId) throw new Error('Neon receivable confirmation failed');
  const current=await dbk62ReadRealOrder(orderId);
  if (!current) throw new Error('Payment was recorded but receipt readback failed; reconcile before retrying');
  const h=mapDBK62History(current);
  return {
    orderId:h.id,orderNumber:h.orderNumber,receiptNumber:h.receiptNumber,
    reference:h.paymentReference,status:'completed',paymentStatus:h.paymentStatus,
    paymentChannel:h.paymentChannel,providerReceiptNumber:h.providerReceiptNumber,
    subtotal:h.subtotal,discountAmount:h.discountAmount,total:h.total,
    amountPaid:h.amountPaid,balanceDue:h.balanceDue,cashTendered:h.cashTendered,
    cashChangeDue:h.cashChangeDue,deliveryFee:h.deliveryFee,
    deliveryLocation:h.deliveryLocation,soldByName:h.soldByName,soldAt:h.soldAt,
    replayed:result.replayed===true,
  };
}

export async function dbk63RecordManualRefund(input:{orderId?:string;receiptNumber?:string;refundAmount?:number;
  reason?:string;restock?:boolean;cancelOutstanding?:boolean;manualRefundConfirmed?:boolean;
  manualRefundReference?:string;items?:unknown},seller:PosSeller) {
  const sql=requireWrite();
  const orderId=requireReal(input.orderId);
  const order=await dbk62ReadRealOrder(orderId);
  if (!order) throw new Error('Neon POS order not found');
  verifySeller(seller,order.store_id);
  const current=mapDBK62History(order);
  if (input.receiptNumber!==current.receiptNumber) throw new Error('Receipt does not match this order');
  if (input.cancelOutstanding) throw new Error('Cancelling Neon outstanding balances is not implemented');
  const refundMinor=moneyMinor(input.refundAmount, true);
  const restock=input.restock===true;
  if (!restock && !refundMinor) throw new Error('Select a refund or stock return');
  if (refundMinor>0 && input.manualRefundConfirmed!==true) throw new Error('External manual refund must be confirmed first');
  if (!externalReference(input.manualRefundReference)) throw new Error('Unique external refund/return reference required');
  const reason=typeof input.reason==='string'?input.reason.trim():'';
  if (!reason || reason.length>300) throw new Error('Refund reason required (maximum 300 characters)');
  const items=normalizeRefundLines(input.items??[],restock);
  const requestKey=stableKey('refund',orderId,input.manualRefundReference);
  const payload={orderId,receiptNumber:current.receiptNumber,refundMinor,
    reason,restock,manualRefundConfirmed:input.manualRefundConfirmed===true,
    manualRefundReference:input.manualRefundReference,items,sellerId:seller.id};
  const rows=await sql`SELECT public.dbk63_record_manual_refund(${requestKey},${JSON.stringify(payload)}::jsonb) AS result`;
  const result=rows[0]?.result as Record<string,unknown>|undefined;
  if (!result || result.orderId!==orderId) throw new Error('Neon return confirmation failed');
  return {returnId:result.refundId,returnNumber:result.returnNumber,
    receiptNumber:current.receiptNumber,providerStatus:'completed',orderId,
    refundAmount:Number(result.refundMinor)/100,refundedAmount:Number(result.totalRefundedMinor)/100,
    restockedItems:result.restocked===true?items.length:0,
    restocked:result.restocked===true,replayed:result.replayed===true};
}

/** Bounded reconciliation: explicitly refuses incomplete history rather than silent totals. */
export async function dbk63ListReconciliation(storeId?:string) {
  const { dbk62ListRealOrders } = await import('@/lib/db/dbk62-pos-cutover');
  const rows=await dbk62ListRealOrders();
  if (rows.length>=500) throw new Error('Neon POS payment history requires pagination before reconciliation');
  return rows.filter(o=>!storeId || o.store_id===storeId).flatMap(o=>{
    const history=mapDBK62History(o);
    return o.payments.map(p=>{
      if (p.provider!=='manual' || !p.event_key || !p.recorded_at) {
        throw new Error('Unknown/unverifiable Neon ledger payment; reconciliation stopped');
      }
      const minor=Number(p.amount_minor);
      if (!Number.isSafeInteger(minor) || minor<1 || minor>1_000_000_000_000) throw new Error('Invalid Neon payment amount');
      return {
        id:p.event_key,reference:p.provider_reference,orderNumber:o.order_number,
        customerName:history.customerName,customerPhone:history.customerPhone,
        provider:'manual',channel:'POS',status:'completed',amount:minor/100,
        providerTransactionId:'',providerReceiptNumber:p.provider_reference,
        processedByName:history.soldByName,createdAt:new Date(p.recorded_at).toISOString(),
        paidAt:new Date(p.recorded_at).toISOString(),storeLocationId:history.storeLocationId,
        storeLocationName:history.storeLocationName,neonSource:true,
      };
    });
  });
}
