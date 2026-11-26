import 'server-only';
import {neon} from '@neondatabase/serverless';
import {deliverRecordedWhatsApp} from './dbk36-production-messages';
const db=()=>neon(process.env.DATABASE_URL!);
/** Transactional system notice, not an AI reply. Same conversation lock as staff/AI.
 * A deterministic key is reserved before sending. Unknown delivery is never replayed. */
export async function notifyVerifiedPayment(reference:string){
  if(!/^DBKWA[A-Z0-9]{7}$/.test(reference))return;
  const sql=db(),key='payment:'+reference;
  const orders=await sql`SELECT o.wa_id,o.amount_kes FROM public.dbk36_wa_prod_payment_orders o
    WHERE o.reference=${reference} AND o.payment_notice_required AND o.status='paid' AND o.receipt IS NOT NULL AND o.paid_at IS NOT NULL
    AND EXISTS(SELECT 1 FROM public.dbk36_wa_paid_intake i WHERE i.reference=o.reference AND i.checkout_id=o.checkout_id AND i.provider_receipt=o.receipt AND i.verification_mode='daraja_api_verified' AND i.amount_minor=o.amount_kes::bigint*100)
    AND NOT EXISTS(SELECT 1 FROM public.dbk159_wa_outbound WHERE request_id=${key})`;
  if(orders.length!==1)return;
  const wa=String(orders[0].wa_id),amount=Number(orders[0].amount_kes);
  if(!/^254(?:7|1)\d{8}$/.test(wa)||!Number.isSafeInteger(amount)||amount<1)return;
  const message=`Thank you! We've received and verified your M-PESA payment of KES ${amount.toLocaleString('en-KE')} for order ${reference}. Our team will confirm when your order is ready for collection. Please don't pay again.`;
  const claimed=await sql`WITH locked AS (
    UPDATE public.dbk36_wa_conversations c SET reply_lock=${key},reply_locked_at=now()
    WHERE c.wa_id=${wa} AND c.reply_lock IS NULL
    AND NOT EXISTS(SELECT 1 FROM public.dbk159_wa_outbound WHERE request_id=${key})
    AND EXISTS(SELECT 1 FROM public.dbk36_wa_messages m WHERE m.wa_id=c.wa_id AND m.direction='in' AND m.created_at>now()-interval '24 hours')
    AND EXISTS(SELECT 1 FROM public.dbk36_wa_prod_payment_orders o WHERE o.reference=${reference} AND o.wa_id=c.wa_id AND o.status='paid' AND o.payment_notice_required AND o.receipt IS NOT NULL)
    RETURNING c.wa_id)
    INSERT INTO public.dbk159_wa_outbound(request_id,wa_id,actor_id,actor_name,message_text,status)
    SELECT ${key},wa_id,'SYSTEM_PAYMENT','Kasiwa Payments',${message},'sending' FROM locked RETURNING request_id`;
  if(!claimed.length)return;
  try{await deliverRecordedWhatsApp(wa,key,message);console.info('DBK160_PAYMENT_NOTICE_ACCEPTED',reference);}
  catch{console.warn('DBK160_PAYMENT_NOTICE_UNCERTAIN',reference);}
  finally{await sql`UPDATE public.dbk36_wa_conversations SET reply_lock=NULL,reply_locked_at=NULL WHERE wa_id=${wa} AND reply_lock=${key}`;}
}
/** Existing authenticated scheduled reconciliation also picks up paid orders that
 * could not acquire the lock during the callback. Only open messaging windows. */
export async function recoverVerifiedPaymentNotices(){
  const sql=db();
  const rows=await sql`SELECT o.reference FROM public.dbk36_wa_prod_payment_orders o
    JOIN public.dbk36_wa_conversations c ON c.wa_id=o.wa_id AND c.reply_lock IS NULL
    WHERE o.payment_notice_required AND o.status='paid' AND o.receipt IS NOT NULL AND o.paid_at IS NOT NULL
    AND EXISTS(SELECT 1 FROM public.dbk36_wa_paid_intake i WHERE i.reference=o.reference AND i.checkout_id=o.checkout_id AND i.provider_receipt=o.receipt AND i.verification_mode='daraja_api_verified' AND i.amount_minor=o.amount_kes::bigint*100)
    AND EXISTS(SELECT 1 FROM public.dbk36_wa_messages m WHERE m.wa_id=o.wa_id AND m.direction='in' AND m.created_at>now()-interval '24 hours')
    AND NOT EXISTS(SELECT 1 FROM public.dbk159_wa_outbound n WHERE n.request_id='payment:'||o.reference)
    ORDER BY o.paid_at ASC LIMIT 2`;
  for(const row of rows){try{await notifyVerifiedPayment(String(row.reference));}catch{console.warn('DBK160_PAYMENT_NOTICE_REVIEW');}}
}
