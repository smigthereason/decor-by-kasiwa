import type { Order, Shipment, OrderStatus } from '../operations/types';
import type { DBK64CheckoutSnapshot } from './dbk64-online-neon';

export const ONLINE_PREFIX = 'dbk64.order.DBK64-';
export function isNeonOnlineOrderId(id: string): boolean {
  return /^dbk64\.order\.DBK64-[0-9]{10,15}-[a-f0-9]{10}$/.test(id);
}
export type NeonOrderRow = {
  order_id: string; order_number: string; reference: string; store_id: string;
  amount_minor: string | number; payment_status: 'PENDING'|'INIT_FAILED'|'PAID';
  stock_status: 'NOT_ATTEMPTED'|'COMMITTED'|'REVIEW_REQUIRED';
  provider_transaction_id: string | null; created_at: string; updated_at: string; paid_at: string | null;
  snapshot: DBK64CheckoutSnapshot; fulfilment_status: string | null;
  fulfilment_updated_at: string | null; dispatched_at: string | null;
  dispatched_by_name: string | null; delivered_at: string | null;
};
function kes(minor: string | number) {
  const text=String(minor);
  if (!/^(0|[1-9][0-9]*)$/.test(text) || Number(text)>1_000_000_000_000 || !Number.isSafeInteger(Number(text))) {
    throw new Error('Invalid Neon online amount; refusing order display');
  }
  return Number(text)/100;
}
const allowedStates: OrderStatus[] = ['pending','paid','processing','ready_for_store','picking','packed','dispatched','delivered','cancelled'];
export function mapNeonOrder(row:NeonOrderRow):Order {
  if (!isNeonOnlineOrderId(row.order_id) || row.order_id!==`dbk64.order.${row.reference}` ||
      row.snapshot.orderId!==row.order_id || row.snapshot.reference!==row.reference ||
      row.snapshot.storeId!==row.store_id || row.snapshot.orderNumber!==row.order_number ||
      kes(row.amount_minor)!==kes(row.snapshot.totalMinor) || !Array.isArray(row.snapshot.lines)) {
    throw new Error('Neon online order failed identity or amount verification');
  }
  const paid=row.payment_status==='PAID';
  const ready=paid && row.stock_status==='COMMITTED';
  const status:OrderStatus= ready && allowedStates.includes(row.fulfilment_status as OrderStatus)
    ? row.fulfilment_status as OrderStatus : paid ? 'paid' : 'pending';
  const address=row.snapshot.deliveryAddress;
  return {
    id:row.order_id, orderNumber:row.order_number,customerId:'',
    customerName:row.snapshot.customerName,customerEmail:row.snapshot.customerEmail,
    customerPhone:row.snapshot.customerPhone,deliveryLocation:row.snapshot.deliveryLocation || address?.address1 || '',
    createdAt:row.created_at,updatedAt:row.fulfilment_updated_at||row.updated_at,
    status,paymentStatus:paid?'paid':row.payment_status==='INIT_FAILED'?'failed':'pending',
    subtotal:kes(row.snapshot.subtotalMinor),deliveryFee:kes(row.snapshot.deliveryMinor),total:kes(row.amount_minor),
    amountPaid:paid?kes(row.amount_minor):0,balanceDue:paid?0:kes(row.amount_minor),
    assignedStore:row.snapshot.storeName,storeLocationId:row.store_id,storeLocationName:row.snapshot.storeName,
    paymentReference:row.reference,paymentProvider:'paystack', providerReceiptNumber:row.provider_transaction_id||undefined,
    paymentChannel:row.snapshot.paymentChannel,salesChannel:'ONLINE',fulfilmentType:'DELIVERY',
    customerNote:paid && !ready ? 'PAYMENT RECEIVED — STOCK REVIEW REQUIRED; DO NOT DISPATCH' : undefined,
    dispatchedAt:row.dispatched_at||undefined,dispatchedByName:row.dispatched_by_name||undefined,
    deliveredAt:row.delivered_at||undefined,
    lineItems:row.snapshot.lines.map((line,i)=>({
      id:`${row.order_id}-${i}`, productId:line.productId,name:line.name,category:'',
      finish:line.finish,size:line.size,variantId:line.variantId,
      quantity:line.quantity,unitPrice:kes(line.unitPriceMinor),
    })),
  };
}
export function mapNeonShipment(row:NeonOrderRow):Shipment|null {
  if (row.payment_status!=='PAID' || row.stock_status!=='COMMITTED') return null;
  const order=mapNeonOrder(row);
  const status=order.status==='dispatched'?'dispatched':order.status==='delivered'?'delivered':
    order.status==='picking'?'picking':order.status==='packed'?'packed':'awaiting_store';
  return {
    id:`dbk65.shipment.${row.reference}`,shipmentNumber:`SHP-${row.order_number}`,
    orderId:row.order_id,orderNumber:order.orderNumber,customerName:order.customerName,
    destination:order.deliveryLocation,storeLocationId:order.storeLocationId,
    storeLocationName:order.storeLocationName,createdAt:order.createdAt,
    updatedAt:order.updatedAt||order.createdAt,status,
    itemCount:order.lineItems.length,totalUnits:order.lineItems.reduce((n,l)=>n+l.quantity,0),
    dispatchedAt:row.dispatched_at||undefined,dispatchedByName:row.dispatched_by_name||undefined,
    deliveredAt:row.delivered_at||undefined,
  };
}
