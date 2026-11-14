import 'server-only';
import {createHash} from 'node:crypto';
import {dbk107LegacyNeonEnabled} from '@/lib/db/dbk107-legacy-finance-neon';
import {dbk62GetProductionSql} from '@/lib/db/dbk62-pos-cutover';
import {dbk108MoneyMinor,dbk108ApplyRefunds} from '@/lib/db/dbk108-legacy-refunds-core';
import {serverClient} from '@/sanity/lib/serverClient';
import {getMainStore,isLegacyStoreName} from '@/lib/stores/main-store';
import type {PosSeller} from '@/lib/pos/server';

export const dbk108LegacyRefundsEnabled=()=>dbk107LegacyNeonEnabled() &&
  process.env.DBK108_LEGACY_REFUNDS_NEON==='YES';
function getSql() {
  if(!dbk108LegacyRefundsEnabled()) throw Error('DBK108 historical refunds are not approved');
  return dbk62GetProductionSql();
}
const hash=(v:string)=>createHash('sha256').update(v).digest('hex');
const refPattern=/^[A-Za-z0-9._-]{8,100}$/;

type RefundOrder={_id:string;_rev:string;orderNumber?:string;receiptNumber?:string;status?:string;
  total:number;amountPaid:number;refundedAmount:number;balanceDue:number;
  paymentProvider?:string;paymentStatus?:string;salesChannel?:string;storeLocationId?:string;
  assignedStore?:string};

export async function dbk108RecordLegacyRefund(input:{orderId?:string;receiptNumber?:string;refundAmount?:number;
  reason?:string;restock?:boolean;cancelOutstanding?:boolean;items?:unknown;
  manualRefundConfirmed?:boolean;manualRefundReference?:string},seller:PosSeller) {
  const sql=getSql();
  if(!seller.id||!['ADMIN','STORE','MANAGER'].includes(seller.role)) throw Error('Not authorized');
  if(typeof input.orderId!=='string'||!input.orderId||input.orderId.length>200)
    throw Error('Invalid historical receipt ID');
  if(input.restock || input.cancelOutstanding || (Array.isArray(input.items)&&input.items.length>0))
    throw Error('Legacy refunds with stock returns or outstanding cancellation require separate reconciliation');
  if(!input.manualRefundConfirmed || typeof input.manualRefundReference!=='string' ||
    !refPattern.test(input.manualRefundReference) || /TEST|SYNTHETIC/i.test(input.manualRefundReference))
    throw Error('External refund must already be completed with a unique reference');
  const amountMinor=dbk108MoneyMinor(input.refundAmount);
  if(amountMinor<=0) throw Error('Refund must be greater than zero');
  const reason=String(input.reason||'').trim();
  if(!reason||reason.length>300) throw Error('Refund reason required, up to 300 characters');
  const source=await serverClient.fetch<RefundOrder|null>(
    `*[_type=='commerceOrder' && _id==$id][0]{_id,_rev,orderNumber,receiptNumber,status,total,amountPaid,refundedAmount,balanceDue,
      paymentProvider,paymentStatus,salesChannel,assignedStore,'storeLocationId':storeLocation._ref}`,
    {id:input.orderId},{cache:'no-store'});
  if(!source?._rev || source.status==='cancelled' || source.paymentProvider?.toLowerCase()==='paystack')
    throw Error('Historical order missing or requires a separate provider refund workflow');
  if(source.receiptNumber !== input.receiptNumber)
    throw Error('Receipt does not match the selected sale');
  // No mixed receivables/refund workflow. Those require a combined ledger.
  if(dbk108MoneyMinor(source.balanceDue)!==0 || source.paymentStatus!=='paid' ||
    dbk108MoneyMinor(source.amountPaid)!==dbk108MoneyMinor(source.total))
    throw Error('Only fully paid legacy sales qualify for the completed-external-refund ledger');
  const main=source.salesChannel==='ONLINE'&&!source.storeLocationId&&isLegacyStoreName(source.assignedStore||'')
    ?await getMainStore():null;
  const storeId=source.storeLocationId||main?.id||'';
  if(!storeId) throw Error('Historical order store must be resolved before refunding');
  if(seller.role!=='ADMIN' && (!seller.storeLocationId || seller.storeLocationId!==storeId))
    throw Error('This refund belongs to a different store');
  const originalRefunded=dbk108MoneyMinor(source.refundedAmount||0);
  const paid=dbk108MoneyMinor(source.amountPaid);
  if(amountMinor>paid-originalRefunded) throw Error('Refund exceeds historical paid balance');
  // A preexisting Sanity return ledger must match Sanity's order summary.
  const recorded=await serverClient.fetch<Array<{refundAmount?:number}>>(
    `*[_type=='returnTransaction' && order._ref==$id && status!='failed']{refundAmount}`,
    {id:source._id},{cache:'no-store'});
  const recordedMinor=recorded.reduce((sum,r)=>sum+dbk108MoneyMinor(r.refundAmount||0),0);
  if(recordedMinor!==originalRefunded) throw Error('Historical Sanity refunds are inconsistent; reconcile before another refund');
  const existing=await serverClient.fetch<number>(
    `count(*[_type=='returnTransaction' && manualRefundReference==$ref])`,
    {ref:input.manualRefundReference},{cache:'no-store'});
  if(existing>0) throw Error('External refund reference already exists in historical Sanity records');
  const requestKey='dbk108-'+hash(source._id+'|'+input.manualRefundReference);
  const payloadHash=hash(JSON.stringify({orderId:source._id,sourceRev:source._rev,
    amountMinor,originalRefunded,paid,reference:input.manualRefundReference,reason,actor:seller.id}));
  const payload={orderId:source._id,sourceRev:source._rev,requestKey,
    externalReference:input.manualRefundReference,actorId:seller.id,reason,payloadHash,
    paidMinor:paid,totalMinor:dbk108MoneyMinor(source.total),originalRefundedMinor:originalRefunded,
    amountMinor,storeId};
  const result=(await sql`SELECT public.dbk108_record_legacy_refund(${JSON.stringify(payload)}::jsonb) AS result`)[0]?.result as
    {orderId?:string;refundId?:string;returnNumber?:string;totalRefundedMinor?:number;replayed?:boolean}|undefined;
  if(!result||result.orderId!==source._id) throw Error('Neon legacy refund receipt requires reconciliation');
  return {returnId:result.refundId,returnNumber:result.returnNumber,receiptNumber:source.receiptNumber,
    providerStatus:'completed',refundAmount:amountMinor/100,refundedAmount:Number(result.totalRefundedMinor)/100,
    restockedItems:0,source:'NEON_LEGACY_REFUND',replayed:result.replayed===true,noStockChange:true,
    externalTransferPerformed:false};
}

export async function dbk108ApplyLegacyRefunds<T extends {id:string;refundedAmount:number;amountPaid:number;paymentStatus:string}>(orders:T[]):Promise<T[]> {
  if(!dbk108LegacyRefundsEnabled()||orders.length===0) return orders;
  const sql=getSql();
  const rows=await sql`SELECT r.order_id,sum(r.amount_minor)::bigint AS amount_minor,
      a.original_refunded_minor FROM public.dbk108_legacy_refunds r
    JOIN public.dbk108_legacy_refund_accounts a ON a.order_id=r.order_id
    GROUP BY r.order_id,a.original_refunded_minor LIMIT 100001`;
  if(rows.length>100000) throw Error('Legacy refunds exceeded reporting read bound');
  return dbk108ApplyRefunds(orders,rows as unknown as Array<{
    order_id:string;amount_minor:number|string;original_refunded_minor:number|string}>);
}

export async function dbk108ReportLegacyRefunds(start:string,end:string,storeId?:string|null) {
  if(!dbk108LegacyRefundsEnabled()) return [] as Array<{amount:number;restock:boolean;items:never[];date:string}>;
  const sql=getSql();
  const rows=await sql`SELECT r.amount_minor, (r.recorded_at AT TIME ZONE 'Africa/Nairobi')::date::text AS date FROM public.dbk108_legacy_refunds r
    JOIN public.dbk108_legacy_refund_accounts a ON a.order_id=r.order_id
    WHERE r.recorded_at>=${start}::timestamptz AND r.recorded_at<=${end}::timestamptz
      AND (${storeId||''}='' OR a.store_id=${storeId||''})
    ORDER BY r.recorded_at DESC LIMIT 100001`;
  if(rows.length>100000) throw Error('Legacy refund report exceeded safe page limit');
  return rows.map(r=>({amount:Number(r.amount_minor)/100,restock:false,items:[] as never[],date:String(r.date)}));
}
