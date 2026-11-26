import 'server-only';
import {dbk62GetProductionSql} from './dbk62-pos-cutover';
import {serverClient} from '@/sanity/lib/serverClient';
import type {PosHistoryOrder,SalesHistoryFilters} from '@/lib/pos/operations';
import {kesMinor,requireCompletePage} from '@/lib/pos/dbk75-report-core';
const STORE='storeLocation.4fcbd28b74494e7da7176525e63d73f4';
export async function readWhatsAppSales(filters:SalesHistoryFilters={},window?:{start:string;end:string}):Promise<PosHistoryOrder[]>{
  if(filters.channel|| (filters.storeId&&filters.storeId!==STORE) || (filters.cashier&&!['kasiwa','kasiwa ai'].includes(filters.cashier.trim().toLowerCase())))return [];
  const sql=dbk62GetProductionSql();
  const start=window?.start||(filters.from?`${filters.from}T00:00:00+03:00`:null);
  const end=window?.end||(filters.to?`${filters.to}T23:59:59.999+03:00`:null);
  // Read existing settlement records. Never insert a sale, charge, or deduct stock here.
  const rows=await sql`SELECT o.reference,o.wa_id,o.amount_kes,o.paid_at,o.stock_state,o.receipt,i.amount_minor,i.cart_snapshot,i.intake_status,
    (SELECT count(*) FROM public.dbk36_wa_prod_callback_inbox c WHERE c.checkout_id=o.checkout_id AND c.merchant_id=o.merchant_id AND c.query_confirmed_at IS NOT NULL) AS confirmed,
    i.verification_mode,i.attested_by,i.provider_receipt,i.checkout_id AS intake_checkout,o.checkout_id,
    i.wa_id AS intake_phone,i.merchant_id AS intake_merchant,o.merchant_id,
    EXISTS(SELECT 1 FROM public.dbk56_pos_payments p WHERE p.provider='daraja' AND p.provider_reference=o.receipt) OR
    EXISTS(SELECT 1 FROM public.dbk68_daraja_orders p WHERE p.receipt_number=o.receipt OR p.checkout_id=o.checkout_id) OR
    EXISTS(SELECT 1 FROM public.dbk55_paid_pos_settlements p WHERE p.payment_provider='daraja' AND (p.provider_receipt=o.receipt OR p.provider_payment_id=o.checkout_id)) AS conflict
    FROM public.dbk36_wa_prod_payment_orders o LEFT JOIN public.dbk36_wa_paid_intake i ON i.reference=o.reference
    WHERE o.status='paid' AND (${start}::timestamptz IS NULL OR o.paid_at>=${start}::timestamptz)
    AND (${end}::timestamptz IS NULL OR o.paid_at<=${end}::timestamptz)
    ORDER BY o.paid_at DESC LIMIT 5001`;
  requireCompletePage(rows.length,5000,'WhatsApp paid sales');
  const ids=new Set<string>(); const receipts=new Set<string>();
  const orders=rows.map<PosHistoryOrder>(r=>{
    const ref=String(r.reference),receipt=String(r.receipt||''),amount=kesMinor(r.amount_minor),date=new Date(r.paid_at).toISOString();
    if(!/^DBKWA[A-Z0-9]{7}$/.test(ref)||!receipt||receipts.has(receipt)||r.conflict||Number(r.confirmed)!==1||r.verification_mode!=='daraja_api_verified'||r.attested_by!=='DBK36_DARAJA_QUERY'||receipt!==r.provider_receipt||r.intake_checkout!==r.checkout_id||r.wa_id!==r.intake_phone||r.intake_merchant!==r.merchant_id||amount!==Number(r.amount_kes)||amount<=0||!Array.isArray(r.cart_snapshot)||!r.cart_snapshot.length)throw new Error('DBK161_WHATSAPP_PAYMENT_PROOF_REVIEW');
    receipts.add(receipt);let sum=0;
    const lineItems=r.cart_snapshot.map((l:Record<string,unknown>)=>{
      const productId=String(l.productId||''),quantity=Number(l.quantity),minor=Number(l.subtotalMinor);
      if(!productId||!Number.isSafeInteger(quantity)||quantity<1||!Number.isSafeInteger(minor)||minor<1||minor%quantity!==0)throw new Error('DBK161_WHATSAPP_LINE_INVALID');
      sum+=minor;ids.add(productId);return {productId,name:productId,variantId:String(l.variantId||''),quantity,unitPrice:minor/quantity/100};
    });
    if(sum!==Math.round(amount*100))throw new Error('DBK161_WHATSAPP_TOTAL_MISMATCH');
    return {id:'DBK36-WA-'+ref,orderNumber:ref,receiptNumber:receipt,customerName:'WhatsApp customer',customerPhone:String(r.wa_id),customerEmail:'',salesChannel:'WHATSAPP',soldByName:'Kasiwa',soldAt:date,paymentStatus:'paid',paymentChannel:'mobile_money',subtotal:amount,discountAmount:0,total:amount,amountPaid:amount,balanceDue:0,cashTendered:0,cashChangeDue:0,deliveryFee:0,deliveryLocation:'',refundedAmount:0,paymentReference:ref,paymentProvider:'daraja',providerReceiptNumber:receipt,storeLocationId:STORE,storeLocationName:'',stockState:String(r.stock_state),lineItems};
  });
  if(ids.size){const products=await serverClient.fetch<Array<{id:string;name:string}>>(`*[_type=='product' && _id in $ids]{"id":_id,name}`,{ids:[...ids]},{cache:'no-store'});
    const names=new Map(products.map(p=>[p.id,p.name]));for(const o of orders)for(const l of o.lineItems)l.name=names.get(l.productId)||l.productId;}
  const q=filters.query?.toLowerCase();return orders.filter(o=>!q||[o.orderNumber,o.receiptNumber,o.customerPhone,...o.lineItems.map(l=>l.name)].some(v=>v.toLowerCase().includes(q)));
}
export function assertWhatsAppDisjoint(wa:PosHistoryOrder[],other:ReadonlyArray<{paymentReference:string;providerReceiptNumber?:string}>){
 const refs=new Set(wa.map(o=>o.paymentReference)),receipts=new Set(wa.map(o=>o.providerReceiptNumber));
 if(other.some(o=>refs.has(o.paymentReference)||(o.providerReceiptNumber&&receipts.has(o.providerReceiptNumber))))throw new Error('DBK161_DUPLICATE_WHATSAPP_SALE_REVIEW');
}
