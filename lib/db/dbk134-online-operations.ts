import 'server-only';
import { dbk62GetProductionSql } from '@/lib/db/dbk62-pos-cutover';
import { dbk65OnlineReadsEnabled } from '@/lib/db/dbk65-online-fulfilment';
import { isNeonOnlineOrderId, mapNeonOrder, type NeonOrderRow } from '@/lib/db/dbk65-online-fulfilment-core';
import type { ApiStaffRole } from '@/lib/auth/api-authorization';

function sql() {
  if (!dbk65OnlineReadsEnabled() || process.env.DBK134_ONLINE_OPERATIONS !== 'YES') {
    throw Error('Neon online staff/refund workflow is disabled');
  }
  return dbk62GetProductionSql();
}
export function dbk134Enabled() { return process.env.DBK134_ONLINE_OPERATIONS === 'YES'; }
export type DBK134Stage='PRODUCTION'|'PACKAGING'|'DELIVERY';
export function dbk134Stage(status:string):DBK134Stage|null {
  if (status==='paid'||status==='processing') return 'PRODUCTION';
  if (status==='ready_for_store'||status==='picking') return 'PACKAGING';
  if (status==='packed') return 'DELIVERY';
  return null;
}
export type DBK134Assignment={order_id:string;stage:DBK134Stage;staff_id:string;staff_name:string;assigned_at:string};
export async function dbk134Assignments(orderIds:string[]):Promise<DBK134Assignment[]> {
  if (!orderIds.length) return [];
  const db=sql();
  const rows=await db`SELECT order_id,stage,staff_id,staff_name,assigned_at
    FROM public.dbk134_online_assignments WHERE order_id=ANY(${orderIds}::text[])`;
  return rows as unknown as DBK134Assignment[];
}
export async function dbk134Assigned(orderId:string):Promise<boolean> {
  const db=sql();
  const rows=await db`SELECT EXISTS(SELECT 1 FROM public.dbk134_online_assignments WHERE order_id=${orderId}) AS present`;
  return rows[0]?.present===true;
}
export async function dbk134Assign(input:{orderId:string;stage:DBK134Stage;staffId:string;staffName:string;actorId:string;actorName:string}) {
  const db=sql();
  const rows=await db`SELECT public.dbk134_online_assign(${input.orderId},${input.stage},
    ${input.staffId},${input.staffName},${input.actorId},${input.actorName}) AS result`;
  return rows[0]?.result;
}
export async function dbk134Advance(input:{orderId:string;status:string;actorId:string;actorName:string;manager:boolean}) {
  const db=sql();
  const rows=await db`SELECT public.dbk134_online_advance(${input.orderId},${input.status},
    ${input.actorId},${input.actorName},${input.manager}) AS result`;
  return rows[0]?.result as {status:string;replayed?:boolean}|undefined;
}

async function rowForOnlineOrder(orderId:string) {
  if (!isNeonOnlineOrderId(orderId)) throw Error('Invalid Neon online order');
  const db=sql();
  const rows=await db`SELECT o.order_id,o.order_number,o.reference,o.store_id,o.amount_minor,
     o.payment_status,o.stock_status,o.provider_transaction_id,o.created_at,o.updated_at,o.paid_at,o.snapshot,
     f.status AS fulfilment_status,f.updated_at AS fulfilment_updated_at,
     f.dispatched_at,f.dispatched_by_name,f.delivered_at
     FROM public.dbk64_online_orders o LEFT JOIN public.dbk65_online_fulfilment f ON f.order_id=o.order_id
     WHERE o.order_id=${orderId} LIMIT 1`;
  if (!rows.length) throw Error('Online order not found');
  const row=rows[0] as unknown as NeonOrderRow;
  const order=mapNeonOrder(row);
  return {row,order};
}
export async function dbk134OnlineOrder(orderId:string) { return (await rowForOnlineOrder(orderId)).order; }
export async function dbk134Receipt(orderId:string) {
  const {row,order}=await rowForOnlineOrder(orderId);
  if (row.payment_status!=='PAID') throw Error('Receipt is available only for confirmed Paystack payments');
  const db=sql();
  const refunds=await db`SELECT coalesce(sum(amount_minor) FILTER (WHERE status='processed'),0) AS processed_minor
    FROM public.dbk134_online_refunds WHERE order_id=${orderId}`;
  const refunded=Number(refunds[0]?.processed_minor||0)/100;
  return {
    _id:order.id,orderNumber:order.orderNumber,receiptNumber:`RCT-${order.orderNumber}`,
    customerName:order.customerName,customerPhone:order.customerPhone,customerEmail:order.customerEmail,
    subtotal:order.subtotal,discountAmount:0,deliveryFee:order.deliveryFee,
    deliveryLocation:order.deliveryLocation,deliveryAddress:row.snapshot.deliveryAddress,
    fulfilmentType:'DELIVERY' as const,total:order.total,amountPaid:order.amountPaid,
    balanceDue:0,refundedAmount:refunded,paymentStatus:'paid',paymentProvider:'paystack',
    paymentChannel:order.paymentChannel,paymentReference:order.paymentReference,
    providerReceiptNumber:order.providerReceiptNumber,soldByName:'Online',soldByRole:'ONLINE',
    soldAt:row.paid_at||row.created_at,
    lineItems:order.lineItems.map((line,i)=>({ _key:`dbk134-${i}`,productId:line.productId,
      name:line.name,category:line.category,finish:line.finish,size:line.size,variantId:line.variantId,
      quantity:line.quantity,unitPrice:line.unitPrice })),
    businessName:'Decor by Kasiwa',businessPhone:'0117553747',businessEmail:'',businessWebsite:'www.decorbykasiwa.co.ke',
    inventoryReviewRequired:row.stock_status!=='COMMITTED',
  };
}

export async function dbk134OrderRefunds(orderId:string) {
  const db=sql();
  const rows=await db`SELECT request_id,provider_reference,amount_minor,status,reason,created_at,updated_at
    FROM public.dbk134_online_refunds WHERE order_id=${orderId} ORDER BY created_at DESC`;
  return rows as unknown as Array<{request_id:string;provider_reference:string;amount_minor:number|string;status:string;reason:string;created_at:string;updated_at:string}>;
}
export async function dbk134RefundHistoryAmounts(orderIds:string[]) {
  if (!orderIds.length) return new Map<string,{processed:number;pending:number}>();
  const db=sql();
  const rows=await db`SELECT order_id,
    coalesce(sum(amount_minor) FILTER (WHERE status='processed'),0) AS processed,
    coalesce(sum(amount_minor) FILTER (WHERE status IN ('reserved','submitting','pending','processing','review_required')),0) AS pending
    FROM public.dbk134_online_refunds WHERE order_id=ANY(${orderIds}::text[]) GROUP BY order_id`;
  return new Map<string,{processed:number;pending:number}>(rows.map(r=>[String(r.order_id),{processed:Number(r.processed)/100,pending:Number(r.pending)/100}]));
}

function isManager(role:ApiStaffRole) {return role==='ADMIN'||role==='STORE'||role==='MANAGER';}
export async function dbk134AuthorizeOrder(input:{id:string;role:ApiStaffRole;storeLocationId?:string}) {
  const order=await dbk134OnlineOrder(input.id);
  if (!isManager(input.role) && !['PRODUCTION_STAFF','PACKAGING_STAFF','DELIVERY_STAFF'].includes(input.role)) throw Error('Staff role not authorized');
  // Admin and Store Owner can operate company-wide; branch Managers remain store-scoped.
  if(input.role==='MANAGER' && (!input.storeLocationId || order.storeLocationId!==input.storeLocationId))
    throw Error('This online order belongs to another store');
  if(!isManager(input.role) && input.storeLocationId && order.storeLocationId!==input.storeLocationId)
    throw Error('This online order belongs to another store');
  return order;
}
