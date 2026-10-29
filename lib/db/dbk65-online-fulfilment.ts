import 'server-only';
import { dbk62GetProductionSql } from './dbk62-pos-cutover';
import { isNeonOnlineOrderId, mapNeonOrder, mapNeonShipment, type NeonOrderRow } from './dbk65-online-fulfilment-core';
import type { Order,Shipment, OrderStatus } from '../operations/types';
import type { ApiStaffRole } from '../auth/api-authorization';

/** Read switch independent of checkout creation: already-paid orders remain visible when new checkouts stop. */
export function dbk65OnlineReadsEnabled() {
  return process.env.DBK65_ONLINE_OPERATIONS_READS==='YES';
}
function readSql() {
  if (!dbk65OnlineReadsEnabled() || process.env.DBK64_ONLINE_READS!=='YES') {
    throw new Error('Neon online fulfilment reads disabled');
  }
  return dbk62GetProductionSql(); // pinned to actual production; never silently uses test branch
}
async function loadRows():Promise<NeonOrderRow[]> {
  const sql=readSql();
  const rows=await sql`SELECT o.order_id,o.order_number,o.reference,o.store_id,o.amount_minor,
       o.payment_status,o.stock_status,o.provider_transaction_id,o.created_at,o.updated_at,o.paid_at,o.snapshot,
       f.status AS fulfilment_status,f.updated_at AS fulfilment_updated_at,
       f.dispatched_at,f.dispatched_by_name,f.delivered_at
    FROM public.dbk64_online_orders o
    LEFT JOIN public.dbk65_online_fulfilment f ON f.order_id=o.order_id
    ORDER BY o.created_at DESC LIMIT 501`;
  if (rows.length>500) throw new Error('Neon order directory exceeds 500: pagination required before cutover');
  return rows as unknown as NeonOrderRow[];
}
export async function dbk65ListOnlineOrders(storeId?:string):Promise<Order[]> {
  const rows=await loadRows();
  return rows.filter(r=>!storeId||r.store_id===storeId).map(mapNeonOrder);
}
export async function dbk65ListOnlineShipments(storeId?:string):Promise<Shipment[]> {
  const rows=await loadRows();
  return rows.filter(r=>!storeId||r.store_id===storeId).map(mapNeonShipment).filter((v):v is Shipment=>v!==null);
}
export async function dbk65ReadOnlineOrder(id:string):Promise<Order|null> {
  if (!isNeonOnlineOrderId(id)) throw new Error('Not a Neon online order ID');
  return (await dbk65ListOnlineOrders()).find(o=>o.id===id)||null;
}
export async function dbk65ChangeOnlineOrder(input:{id:string;status:OrderStatus;role:ApiStaffRole;
  actorId:string;actorName:string;assignedStoreId?:string}) {
  if (!isNeonOnlineOrderId(input.id) || !['ADMIN','STORE','MANAGER'].includes(input.role) ||
      !input.actorId || !input.actorName || !['processing','ready_for_store','picking','packed','dispatched'].includes(input.status)) {
    throw new Error('Invalid Neon fulfilment request');
  }
  if (!dbk65OnlineReadsEnabled() || process.env.DBK65_ONLINE_FULFILMENT_WRITE!=='YES') {
    throw new Error('Neon online fulfilment writes disabled');
  }
  const order=await dbk65ReadOnlineOrder(input.id);
  if (!order) throw new Error('Neon online order not found');
  if (input.role!=='ADMIN' && (!input.assignedStoreId || order.storeLocationId!==input.assignedStoreId)) {
    throw new Error('Staff member is not assigned to this fulfilment store');
  }
  const sql=readSql();
  const rows=await sql`SELECT public.dbk65_transition_online_fulfilment(
    ${input.id},${input.status},${input.actorId},${input.actorName}) AS result`;
  const result=rows[0]?.result as {status?:string,replayed?:boolean}|undefined;
  if (result?.status!==input.status) throw new Error('Neon fulfilment transition not confirmed');
  return {ok:true,...result};
}
