import 'server-only';
import { createHash } from 'node:crypto';
import { dbk62CutoverRequested, dbk62GetProductionSql } from '@/lib/db/dbk62-pos-cutover';
import { serverClient } from '@/sanity/lib/serverClient';
import { getMainStore, isLegacyStoreName } from '@/lib/stores/main-store';
import type { PosSeller } from '@/lib/pos/server';
import type { PosHistoryOrder } from '@/lib/pos/operations';
import { dbk107ValidateMoney, dbk107ApplyLegacyBalances } from '@/lib/db/dbk107-legacy-finance-core';

/** Independent opt-in. Absence of ANY flag leaves the old behavior unchanged. */
export function dbk107LegacyNeonEnabled() {
  return dbk62CutoverRequested() && process.env.DBK77_LEGACY_FINANCE_BRIDGE === 'YES' &&
    process.env.DBK102_OPERATIONAL_NEON_ONLY === 'YES' &&
    process.env.DBK107_LEGACY_FINANCE_NEON === 'YES';
}
function sqlForLegacy() {
  if (!dbk107LegacyNeonEnabled()) throw new Error('DBK107 legacy Neon finance is not approved');
  return dbk62GetProductionSql(); // pinned production database and approved POS cutover
}

type CollectionAggregate={order_id:string; amount_minor:number|string;original_balance_minor:number|string};
export async function dbk107ApplyToLegacyOrders(orders:PosHistoryOrder[]):Promise<PosHistoryOrder[]> {
  if (!dbk107LegacyNeonEnabled() || orders.length===0) return orders;
  const sql=sqlForLegacy();
  const rows=await sql`SELECT c.order_id,sum(c.amount_minor)::bigint AS amount_minor,
      a.original_balance_minor AS original_balance_minor
    FROM public.dbk107_legacy_receivable_collections c
    JOIN public.dbk107_legacy_receivable_accounts a ON a.order_id=c.order_id
    GROUP BY c.order_id,a.original_balance_minor LIMIT 100001`;
  if (rows.length>100000) throw new Error('Legacy receivable ledger exceeded safe read limit');
  return dbk107ApplyLegacyBalances(orders,rows as unknown as CollectionAggregate[]);
}

export async function dbk107RecordLegacyCollection(input:{orderId:string;amount:number;requestId:string;paymentReference:string},seller:PosSeller) {
  const sql=sqlForLegacy();
  if (!seller.id || !['ADMIN','STORE','MANAGER'].includes(seller.role)) throw new Error('Not authorized for historical finance');
  if (!input.orderId || input.orderId.length>200 || !/^[A-Za-z0-9._-]{8,100}$/.test(input.requestId) ||
      !/^[A-Za-z0-9._-]{8,100}$/.test(input.paymentReference)) throw new Error('Invalid legacy collection request');
  const source=await serverClient.fetch<{
    _id:string;_rev:string;total:number;balanceDue:number;amountPaid:number;paymentStatus:string;status:string;
    orderNumber?:string;receiptNumber?:string;salesChannel?:string;assignedStore?:string;
    storeLocationId?:string;customerId?:string;
  }|null>(`*[_type == 'commerceOrder' && _id == $id][0]{_id,_rev,total,balanceDue,amountPaid,paymentStatus,status,orderNumber,receiptNumber,salesChannel,assignedStore,
    'storeLocationId':storeLocation._ref,'customerId':customer._ref}`,{id:input.orderId},{cache:'no-store'});
  if (!source?._rev || source.status==='cancelled' || !['pending','partially_paid'].includes(source.paymentStatus))
    throw new Error('Historical debt state requires reconciliation; collection not recorded');
  // Fail closed for ambiguous legacy Main store assignment instead of trusting a browser-supplied store ID.
  const main=(!source.salesChannel || source.salesChannel==='ONLINE') && !source.storeLocationId && isLegacyStoreName(source.assignedStore||'')
    ? await getMainStore() : null;
  const storeId=source.storeLocationId || main?.id || '';
  if (seller.role!=='ADMIN' && (!seller.storeLocationId || storeId!==seller.storeLocationId))
    throw new Error('Historical order is not assigned to this staff member\'s store; resolve its store before collecting');
  const amountMinor=dbk107ValidateMoney(input.amount);
  const balanceMinor=dbk107ValidateMoney(source.balanceDue);
  const paidMinor=dbk107ValidateMoney(source.amountPaid);
  const totalMinor=dbk107ValidateMoney(source.total);
  if (amountMinor<1 || balanceMinor<1 || amountMinor>balanceMinor || paidMinor+balanceMinor>totalMinor)
    throw new Error('Historical amount exceeds original outstanding balance; reconcile before collecting');
  const requestKey='dbk107-'+createHash('sha256').update(`${input.orderId}|${input.requestId}`).digest('hex');
  const payloadHash=createHash('sha256').update(JSON.stringify({orderId:input.orderId,
    amountMinor,providerReference:input.paymentReference,actorId:seller.id,requestKey})).digest('hex');
  const payload={orderId:input.orderId,sourceRev:source._rev,sourceBalanceMinor:balanceMinor,
    sourcePaidMinor:paidMinor,sourceTotalMinor:totalMinor,paymentStatus:source.paymentStatus,
    storeId,customerId:source.customerId||'',requestKey,providerReference:input.paymentReference,
    actorId:seller.id,amountMinor,payloadHash};
  const response=await sql`SELECT public.dbk107_record_legacy_collection(${JSON.stringify(payload)}::jsonb) AS result`;
  const result=response[0]?.result as {orderId?:string;collectedMinor?:number;amountPaidMinor?:number;
    balanceDueMinor?:number;paymentStatus?:string;replayed?:boolean}|undefined;
  if (!result || result.orderId!==source._id || !Number.isSafeInteger(Number(result.balanceDueMinor)))
    throw new Error('Neon legacy collection needs operator reconciliation; do not submit another payment');
  return {orderId:source._id,orderNumber:source.orderNumber,receiptNumber:source.receiptNumber,
    paymentStatus:result.paymentStatus,amountPaid:Number(result.amountPaidMinor)/100,
    balanceDue:Number(result.balanceDueMinor)/100,replayed:result.replayed===true,
    status:'completed',paymentChannel:'external',providerReceiptNumber:input.paymentReference,
    source:'NEON_LEGACY_COLLECTION',noStockChange:true};
}

export async function dbk107ReportCollections(start:string,end:string,storeId?:string|null) {
  if (!dbk107LegacyNeonEnabled()) return {totalPeriodKES:0,totalAllKES:0,dated:[] as Array<{date:string;amount:number}>};
  const sql=sqlForLegacy();
  const totals=await sql`SELECT
    coalesce(sum(c.amount_minor),0)::bigint AS all_minor,
    coalesce(sum(c.amount_minor) FILTER (WHERE c.created_at >= ${start}::timestamptz
      AND c.created_at <= ${end}::timestamptz),0)::bigint AS period_minor
    FROM public.dbk107_legacy_receivable_collections c
    JOIN public.dbk107_legacy_receivable_accounts a ON a.order_id=c.order_id
    WHERE (${storeId||''}='' OR a.store_id=${storeId||''})`;
  const days=await sql`SELECT to_char(c.created_at AT TIME ZONE 'Africa/Nairobi','YYYY-MM-DD') AS date,
      sum(c.amount_minor)::bigint AS amount_minor
    FROM public.dbk107_legacy_receivable_collections c
    JOIN public.dbk107_legacy_receivable_accounts a ON a.order_id=c.order_id
    WHERE c.created_at >= ${start}::timestamptz AND c.created_at <= ${end}::timestamptz
      AND (${storeId||''}='' OR a.store_id=${storeId||''})
    GROUP BY 1 ORDER BY 1`;
  const all=Number(totals[0]?.all_minor||0),period=Number(totals[0]?.period_minor||0);
  if (![all,period].every(x=>Number.isSafeInteger(x)&&x>=0)) throw Error('Invalid Neon legacy report totals');
  return {totalAllKES:all/100,totalPeriodKES:period/100,
    dated:days.map(x=>({date:String(x.date),amount:Number(x.amount_minor)/100}))};
}
