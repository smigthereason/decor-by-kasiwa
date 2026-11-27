import 'server-only';
import { dbk62GetProductionSql } from '@/lib/db/dbk62-pos-cutover';

const MAIN_STORE = 'storeLocation.4fcbd28b74494e7da7176525e63d73f4';
export const dbk136Enabled = () => process.env.DBK136_WA_UNIFIED_WORKFLOW === 'YES';
export type DBK136WAStage = 'PRODUCTION' | 'PACKAGING' | 'DELIVERY';
function db() {
  if (!dbk136Enabled() || process.env.VERCEL_ENV !== 'production' ||
    process.env.DBK36_WA_PAID_INTAKE_ENABLED !== 'YES' || process.env.DBK36_STAGING_WORKER === 'YES') {
    throw Error('WhatsApp workflow is not active');
  }
  return dbk62GetProductionSql();
}
export async function dbk136ListWhatsappJobs(storeId?:string) {
  if (storeId && storeId !== MAIN_STORE) return [];
  const sql = db();
  const rows=await sql`SELECT w.reference,w.order_number,w.stage,w.assigned_staff_id,w.assigned_staff_name,
      f.store_id,f.cart_snapshot,f.stock_state,
      p.wa_id,p.amount_minor,p.paid_at,p.created_at
    FROM public.dbk136_wa_workflow w
    JOIN public.dbk36_wa_stock_fulfillment f ON f.reference=w.reference
    JOIN public.dbk36_wa_paid_intake p ON p.reference=w.reference
    JOIN public.dbk36_wa_prod_payment_orders o ON o.reference=w.reference
    WHERE f.store_id=${MAIN_STORE} AND w.stage IN ('PRODUCTION','PACKAGING','DELIVERY')
      AND f.stock_state='COMMITTED' AND p.verification_mode='daraja_api_verified'
      AND o.status='paid' AND o.stock_state='COMMITTED'
      AND f.fulfillment_state NOT IN ('HANDED_OVER','REFUND_REVIEW')
    ORDER BY p.paid_at DESC LIMIT 100`;
  return rows.map(r=>{
    const lines=Array.isArray(r.cart_snapshot)?r.cart_snapshot:[];
    const stage=String(r.stage) as DBK136WAStage;
    return {
      id:String(r.reference),orderNumber:String(r.order_number),reference:String(r.reference),
      customerName:`WhatsApp customer ••••${String(r.wa_id||'').slice(-4)}`,
      storeLocationId:String(r.store_id),storeLocationName:'',
      orderDate:new Date(String(r.paid_at||r.created_at)).toISOString(),
      paymentStatus:'paid',status: stage==='PRODUCTION'?'paid':stage==='PACKAGING'?'picking':'packed',
      stockReady:true,total:Number(r.amount_minor)/100,
      items:lines.map((line:Record<string,unknown>)=>({
        name:String(line.name||line.productName||line.productId||'Product'),
        quantity:Number(line.quantity||1),
      })),
      stage,assignedStaffId:String(r.assigned_staff_id||''),assignedStaffName:String(r.assigned_staff_name||''),
      channel:'WHATSAPP' as const,cartSnapshot:r.cart_snapshot,
    };
  });
}
export async function dbk136SyncWhatsappJobs() {
  const sql=db();
  const rows=await sql`SELECT public.dbk136_sync_verified_whatsapp(200) AS result`;
  return rows[0]?.result;
}
export async function dbk136AssignWhatsapp(input:{reference:string;stage:DBK136WAStage;staffId:string;staffName:string;actorId:string}) {
  const sql=db();
  const rows=await sql`SELECT public.dbk136_assign_whatsapp(${input.reference},${input.stage},
     ${input.staffId},${input.staffName},${input.actorId}) AS result`;
  return rows[0]?.result;
}
export async function dbk136AdvanceWhatsapp(input:{reference:string;stage:DBK136WAStage;actorId:string;manager:boolean}) {
  const sql=db();
  const rows=await sql`SELECT public.dbk136_advance_whatsapp(${input.reference},${input.stage},
     ${input.actorId},${input.manager}) AS result`;
  return rows[0]?.result;
}
export const dbk136MainStoreId=MAIN_STORE;

export async function dbk136JobState(reference:string){
  const sql=db();
  const rows=await sql`SELECT w.stage,w.assigned_staff_id FROM public.dbk136_wa_workflow w JOIN public.dbk36_wa_stock_fulfillment f ON f.reference=w.reference WHERE w.reference=${reference} AND f.store_id=${MAIN_STORE} LIMIT 1`;
  return rows[0]||null;
}
