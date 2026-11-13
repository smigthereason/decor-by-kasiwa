import 'server-only';
import {createHmac} from 'node:crypto';
import {neon} from '@neondatabase/serverless';
import {handleProductionChat} from './dbk36-production-chat';
const phone=/^254(?:7|1)\d{8}$/;
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
      text?:{body?:string};interactive?:{button_reply?:{title?:string};list_reply?:{title?:string}}}>}}>} >};
  let accepted=0;const sql=db();
  for(const entry of (body.entry||[]).slice(0,4))for(const change of (entry.changes||[]).slice(0,4)){
    const value=change.value;
    if(!value||value.metadata?.phone_number_id!==target)continue;
    for(const m of (value.messages||[]).slice(0,15)){
      const wa=String(m.from||''),messageId=String(m.id||'');
      if(!phone.test(wa)||!/^wamid\.[\w:=+/.-]{8,200}$/.test(messageId))continue;
      const txt=String(m.text?.body||m.interactive?.button_reply?.title||m.interactive?.list_reply?.title||'').trim().slice(0,500);
      if(!txt)continue;
      await sql`INSERT INTO public.dbk36_wa_conversations(wa_id,last_inbound_at)
        VALUES(${wa},now()) ON CONFLICT(wa_id) DO UPDATE
        SET last_inbound_at=now(),updated_at=now()`;
      const result=await sql`INSERT INTO public.dbk36_wa_messages(wa_id,provider_message_id,direction,message_type,message_text,status)
        VALUES(${wa},${messageId},'in','text',${txt},'pending')
        ON CONFLICT(provider_message_id) DO NOTHING RETURNING id`;
      accepted+=result.length;
    }
  }
  return {accepted};
}
async function sendThroughDedicatedWorker(waId:string,text:string){
  if(process.env.DBK36_WA_PRODUCTION_CHAT_ENABLED!=='YES')throw new Error('CHAT_GATE_OFF');
  const secret=process.env.DBK36_WA_PRODUCTION_BRIDGE_SECRET||'';
  if(secret.length<32)throw new Error('BRIDGE_SECRET_NOT_CONFIGURED');
  const body=JSON.stringify({to:waId,text:text.slice(0,3500)});
  const stamp=String(Math.floor(Date.now()/1000));
  const signature=createHmac('sha256',secret).update(`${stamp}.${body}`).digest('hex');
  const result=await fetch(worker+'/__dbk36/send',{
    method:'POST',cache:'no-store',redirect:'manual',signal:AbortSignal.timeout(15000),
    headers:{'Content-Type':'application/json','x-dbk36-timestamp':stamp,'x-dbk36-signature':signature},
    body});
  if(!result.ok)throw new Error('META_OUTBOUND_UNCONFIRMED_MANUAL_REVIEW');
}
/** At most one attempted send per unique inbound message. Uncertain Meta
 * delivery is REVIEW, not automatic replay, to avoid duplicate replies/PAY. */
export async function processProductionWhatsAppQueue(limit=3){
  if(process.env.DBK36_WA_PRODUCTION_CHAT_ENABLED!=='YES')throw new Error('PRODUCTION_CHAT_DISABLED');
  const sql=db();const out:{processed:number;review:number}={processed:0,review:0};
  for(let n=0;n<Math.max(1,Math.min(5,limit));n++){
    const items=await sql`WITH next AS (
      SELECT id FROM public.dbk36_wa_messages
      WHERE direction='in' AND status='pending' AND next_attempt_at<=now()
      ORDER BY created_at ASC FOR UPDATE SKIP LOCKED LIMIT 1)
      UPDATE public.dbk36_wa_messages AS m
      SET status='processing',attempts=m.attempts+1,claimed_at=now(),updated_at=now()
      FROM next WHERE m.id=next.id RETURNING m.id,m.wa_id,m.message_text`;
    if(!items.length)break;
    const m=items[0];const id=String(m.id),wa=String(m.wa_id);
    try{
      const answer=await handleProductionChat(wa,String(m.message_text));
      await sendThroughDedicatedWorker(wa,answer.reply);
      await sql`UPDATE public.dbk36_wa_messages SET status='done',updated_at=now() WHERE id=${id}::uuid AND status='processing'`;
      out.processed++;
    }catch{
      await sql`UPDATE public.dbk36_wa_messages
        SET status='failed',last_error='PRODUCTION_MESSAGE_REQUIRES_REVIEW',updated_at=now()
        WHERE id=${id}::uuid AND status='processing'`;
      out.review++;
    }
  }
  return out;
}
