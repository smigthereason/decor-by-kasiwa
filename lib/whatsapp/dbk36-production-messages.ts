import 'server-only';
import {createHmac} from 'node:crypto';
import {neon} from '@neondatabase/serverless';
import {ensureInboundImage,describeInboundImage,referencedVisual,referenceQuestion} from './dbk166-inbound-media';
import {handleProductionChat} from './dbk36-production-chat';
const phone=/^254(?:7|1)\d{8}$/;
// Only explicit user-scoped WhatsApp IDs. Not a substitute for a verified phone.
const bsuid=/^[A-Z]{2}\.[0-9]{6,32}$/;
const db=()=>neon(process.env.DATABASE_URL!);
const worker='https://dbk36-whatsapp-production.victor-dmaina.workers.dev';
/** Only called by the HMAC-verified Worker after the Worker itself verifies Meta. */
export async function recordProductionWhatsAppInbound(raw:unknown){
  if(process.env.DBK36_WA_PRODUCTION_CHAT_ENABLED!=='YES')throw new Error('PRODUCTION_CHAT_DISABLED');
  const target=process.env.DBK36_WA_PRODUCTION_PHONE_NUMBER_ID||'';
  if(!/^\d{8,25}$/.test(target))throw new Error('OFFICIAL_PHONE_ID_NOT_REGISTERED');
  if(!raw||typeof raw!=='object')throw new Error('META_BODY_INVALID');
  const body=raw as {entry?:Array<{changes?:Array<{value?:{
    metadata?:{phone_number_id?:string};messages?:Array<{id?:string;from?:string;type?:string;
      image?:{id?:string;caption?:string};context?:{id?:string};text?:{body?:string};interactive?:{button_reply?:{title?:string};list_reply?:{title?:string}}}>}}>} >};
  let accepted=0;const humanImages:string[]=[];const sql=db();
  for(const entry of (body.entry||[]).slice(0,4))for(const change of (entry.changes||[]).slice(0,4)){
    const value=change.value;
    if(!value||value.metadata?.phone_number_id!==target)continue;
    for(const m of (value.messages||[]).slice(0,15)){
      const wa=String(m.from||''),messageId=String(m.id||'');
      if(!(phone.test(wa)||bsuid.test(wa))||!/^wamid\.[\w:=+/.-]{8,200}$/.test(messageId))continue;
      const mediaId=m.type==='image'&&/^\d{5,30}$/.test(String(m.image?.id||''))?String(m.image?.id):null;
      const txt=String(mediaId?m.image?.caption||'':m.text?.body||m.interactive?.button_reply?.title||m.interactive?.list_reply?.title||'').trim().slice(0,500);
      const contextId=/^wamid\.[\w:=+/.-]{8,200}$/.test(String(m.context?.id||''))?String(m.context?.id):null;
      if(!txt&&!mediaId)continue;
      // The upsert locks this conversation until the message is inserted. Inbound
      // messages during staff ownership are recorded, never queued for a later AI reply.
      const result=await sql`WITH conversation AS (
        INSERT INTO public.dbk36_wa_conversations(wa_id,last_inbound_at)
        VALUES(${wa},now()) ON CONFLICT(wa_id) DO UPDATE
        SET last_inbound_at=now(),updated_at=now() RETURNING wa_id,mode)
        INSERT INTO public.dbk36_wa_messages(wa_id,provider_message_id,direction,message_type,message_text,status,media_id,context_provider_id)
        SELECT wa_id,${messageId},'in',${mediaId?'image':'text'},${txt||'[Customer photo]'},CASE WHEN mode='human' THEN 'done' ELSE 'pending' END,${mediaId},${contextId} FROM conversation
        ON CONFLICT(provider_message_id) DO NOTHING RETURNING id,status`;
      accepted+=result.length;
      if(mediaId&&result[0]?.status==='done')humanImages.push(String(result[0].id));
    }
  }
  return {accepted,humanImages};
}
async function sendThroughDedicatedWorker(waId:string,text:string,imageUrl?:string){
  if(process.env.DBK36_WA_PRODUCTION_CHAT_ENABLED!=='YES')throw new Error('CHAT_GATE_OFF');
  const secret=process.env.DBK36_WA_PRODUCTION_BRIDGE_SECRET||'';
  if(secret.length<32)throw new Error('BRIDGE_SECRET_NOT_CONFIGURED');
  const body=JSON.stringify({to:waId,text:text.slice(0,imageUrl?1024:3500),...(imageUrl?{imageUrl}:{})});
  const stamp=String(Math.floor(Date.now()/1000));
  const signature=createHmac('sha256',secret).update(`${stamp}.${body}`).digest('hex');
  const result=await fetch(worker+'/__dbk36/send',{
    method:'POST',cache:'no-store',redirect:'manual',signal:AbortSignal.timeout(imageUrl?6000:10000),
    headers:{'Content-Type':'application/json','x-dbk36-timestamp':stamp,'x-dbk36-signature':signature},
    body}).catch(()=>{console.warn('DBK156_OUTBOUND_UNCERTAIN',{kind:imageUrl?'image':'text'});throw new Error('META_OUTBOUND_UNCONFIRMED_MANUAL_REVIEW');});
  if(!result.ok){console.warn('DBK156_OUTBOUND_REJECTED',{kind:imageUrl?'image':'text',status:result.status});throw new Error('META_OUTBOUND_UNCONFIRMED_MANUAL_REVIEW');}
  if(imageUrl)console.info('DBK156_MEDIA_ACCEPTED');
  const response=await result.json().catch(()=>null);
  return /^wamid\.[\w:=+/.-]{8,200}$/.test(String(response?.messageId||''))?String(response.messageId):null;
}
/** Persist the attempt BEFORE calling Meta. Never replay an uncertain send. */
export async function sendRecordedWhatsApp(wa:string,id:string,actorId:string,actorName:string,text:string,imageUrl?:string){
  const sql=db();
  const created=await sql`INSERT INTO public.dbk159_wa_outbound(request_id,wa_id,actor_id,actor_name,message_text,image_url,status)
    VALUES(${id},${wa},${actorId},${actorName},${text},${imageUrl||null},'sending') ON CONFLICT(request_id) DO NOTHING RETURNING request_id`;
  if(!created.length)throw new Error('MESSAGE_ALREADY_ATTEMPTED');
  await deliverRecordedWhatsApp(wa,id,text,imageUrl);
}
/** Caller must own the durable conversation reply lock and have inserted the attempt. */
export async function deliverRecordedWhatsApp(wa:string,id:string,text:string,imageUrl?:string){
  const sql=db();
  try{
    const providerId=await sendThroughDedicatedWorker(wa,text,imageUrl);
    await sql`UPDATE public.dbk159_wa_outbound SET status='accepted',provider_message_id=${providerId},updated_at=now() WHERE request_id=${id} AND status='sending'`;
  }catch(error){
    await sql`UPDATE public.dbk159_wa_outbound SET status='uncertain',updated_at=now() WHERE request_id=${id} AND status='sending'`;
    throw error;
  }
}
/** At most one attempted send per unique inbound message. Uncertain Meta
 * delivery is REVIEW, not automatic replay, to avoid duplicate replies/PAY. */
export async function processProductionWhatsAppQueue(limit=3){
  if(process.env.DBK36_WA_PRODUCTION_CHAT_ENABLED!=='YES')throw new Error('PRODUCTION_CHAT_DISABLED');
  const sql=db();const out:{processed:number;review:number}={processed:0,review:0};
  for(let n=0;n<Math.max(1,Math.min(5,limit));n++){
    // Claim the conversation and its earliest pending message atomically. No staff
    // assignment can slip between claiming the inbound event and the AI send.
    const items=await sql`WITH next AS (
      SELECT m.id,m.wa_id FROM public.dbk36_wa_messages m JOIN public.dbk36_wa_conversations c ON c.wa_id=m.wa_id
      WHERE m.direction='in' AND m.status='pending' AND m.next_attempt_at<=now() AND c.reply_lock IS NULL
      AND NOT EXISTS(SELECT 1 FROM public.dbk36_wa_messages earlier WHERE earlier.wa_id=m.wa_id AND earlier.direction='in' AND earlier.status IN ('pending','processing') AND (earlier.created_at,earlier.id)<(m.created_at,m.id))
      ORDER BY m.created_at ASC,m.id ASC FOR UPDATE OF c,m SKIP LOCKED LIMIT 1),
      locked AS (UPDATE public.dbk36_wa_conversations c SET reply_lock='ai:'||next.id::text,reply_locked_at=now()
        FROM next WHERE c.wa_id=next.wa_id AND c.reply_lock IS NULL RETURNING c.wa_id,c.mode,c.reply_lock,next.id)
      UPDATE public.dbk36_wa_messages AS m
      SET status='processing',attempts=m.attempts+1,claimed_at=now(),updated_at=now()
      FROM locked WHERE m.id=locked.id RETURNING m.id,m.wa_id,m.message_text,m.message_type,m.context_provider_id,locked.mode,locked.reply_lock`;
    if(!items.length)break;
    const m=items[0];const id=String(m.id),wa=String(m.wa_id),lock=String(m.reply_lock);
    try{
      // A human-owned conversation remains silent until staff explicitly resumes AI.
      if(m.mode==='bot'){
        const text=String(m.message_text);
        // Never interpret an image caption or vision output as payment consent.
        const image=m.message_type==='image'?await ensureInboundImage(id):null;
        const visual=m.message_type==='image'?{query:await describeInboundImage(image,text),...(image?{image}:{})}:
          m.context_provider_id&&referenceQuestion(text)?(await referencedVisual(wa,String(m.context_provider_id))||{query:null}):undefined;
        const answer=await handleProductionChat(wa,text,visual);
        await sendRecordedWhatsApp(wa,lock+':0','AI','Kasiwa',answer.reply);
        let index=0;
        for(const image of (answer.images||[]).slice(0,3))await sendRecordedWhatsApp(wa,lock+':'+(++index),'AI','Kasiwa',image.caption,image.url);
      }
      await sql`UPDATE public.dbk36_wa_messages SET status='done',updated_at=now() WHERE id=${id}::uuid AND status='processing'`;
      out.processed++;
    }catch{
      await sql`UPDATE public.dbk36_wa_messages
        SET status='failed',last_error='PRODUCTION_MESSAGE_REQUIRES_REVIEW',updated_at=now()
        WHERE id=${id}::uuid AND status='processing'`;
      out.review++;
    }finally{
      await sql`UPDATE public.dbk36_wa_conversations SET reply_lock=NULL,reply_locked_at=NULL WHERE wa_id=${wa} AND reply_lock=${lock}`;
    }
  }
  return out;
}
