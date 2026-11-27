/** DBK-36 dedicated PRODUCTION WhatsApp perimeter. Never connects to staging Neon.
 * All payments/stock are handled by the verified main-Vercel backend.
 * Public WhatsApp and checkout gates are OFF until official number onboarding.
 */
const base='https://www.decorbykasiwa.co.ke';
const cache={'Cache-Control':'no-store','X-Content-Type-Options':'nosniff'};
const error=(status=404)=>new Response('Not found',{status,headers:cache});
function configured(env){
  return env.DBK36_PRODUCTION_WORKER==='YES'&&env.DBK36_STAGING_WORKER!=='YES'&&
    env.DBK36_PRODUCTION_BACKEND_ORIGIN===base;
}
async function sign(ts,raw,secret){
  const key=await crypto.subtle.importKey('raw',new TextEncoder().encode(secret),
    {name:'HMAC',hash:'SHA-256'},false,['sign']);
  const bytes=await crypto.subtle.sign('HMAC',key,new TextEncoder().encode(`${ts}.${raw}`));
  return [...new Uint8Array(bytes)].map(x=>x.toString(16).padStart(2,'0')).join('');
}
async function relay(raw,destination,env,extra={}){
  if(!configured(env)||!env.DBK36_WA_PRODUCTION_BRIDGE_SECRET||
    env.DBK36_WA_PRODUCTION_BRIDGE_SECRET.length<32)return error(503);
  const ts=String(Math.floor(Date.now()/1000));
  const signature=await sign(ts,raw,env.DBK36_WA_PRODUCTION_BRIDGE_SECRET);
  const res=await fetch(base+destination,{
    method:'POST',headers:{'Content-Type':'application/json','x-dbk36-timestamp':ts,
      'x-dbk36-signature':signature,...extra},body:raw,redirect:'manual',
  });
  if(res.status>=300&&res.status<400)return error(502);
  return new Response(res.body,{status:res.status,headers:cache});
}
/** The public Meta bot is restricted to explicit test phones until cutover is approved. */
const onlyMeta=(env)=>env.DBK36_PRODUCTION_META_ENABLED==='YES' &&
  env.DBK36_PRODUCTION_YCLOUD_ENABLED!=='YES';
const digits=(value)=>String(value||'').replace(/[^0-9]/g,'');
const validPhone=(value)=>/^254(?:7|1)\d{8}$/.test(value);
const testPhones=(env)=>String(env.DBK36_META_TEST_NUMBERS||'').split(',')
  .map(digits).filter(validPhone);
const allowed=(number,env)=>env.DBK36_META_PUBLIC_BOT==='YES'||testPhones(env).includes(number);
function filterMetaInbound(raw,env,stats){
  let body;try{body=JSON.parse(raw);}catch{return null;}
  const expectedWaba=String(env.WHATSAPP_WABA_ID||'');
  const phoneId=String(env.WHATSAPP_PHONE_NUMBER_ID||'');
  if(!/^\d{8,25}$/.test(expectedWaba)||!/^\d{8,25}$/.test(phoneId)||
    body?.object!=='whatsapp_business_account'||!Array.isArray(body.entry))return null;
  const entry=[];
  for(const e of body.entry.slice(0,4)){
    if(!Array.isArray(e?.changes))continue;
    if(String(e?.id||'')!==expectedWaba){stats.wabaMismatch+=e.changes.reduce((n,c)=>n+(Array.isArray(c?.value?.messages)?c.value.messages.length:0),0);continue;}
    const changes=[];
    for(const c of e.changes.slice(0,4)){
      if(c?.field!=='messages')continue;
      if(String(c.value?.metadata?.phone_number_id||'')!==phoneId){stats.phoneMismatch+=Array.isArray(c.value?.messages)?c.value.messages.length:0;continue;}
      const messages=(Array.isArray(c.value.messages)?c.value.messages:[]).slice(0,15).filter(m=>{
        const from=String(m?.from||'');
        stats.received++;
        if(!validPhone(from)){stats.unsupportedSender++;return false;}
        if(!allowed(from,env)){stats.notAllowed++;return false;}
        if(!/^wamid\.[\w:=+/.-]{8,200}$/.test(String(m.id||''))){stats.invalidId++;return false;}
        if(!((m?.type==='text'&&typeof m?.text?.body==='string'&&Boolean(m.text.body.trim()))||(m?.type==='image'&&/^\d{5,30}$/.test(String(m.image?.id||''))))){stats.unsupportedMessage++;return false;}
        stats.forwarded++;return true;
      });
      if(messages.length)changes.push({field:'messages',value:{metadata:{phone_number_id:phoneId},messages}});
    }
    if(changes.length)entry.push({id:expectedWaba,changes});
  }
  return entry.length?{object:'whatsapp_business_account',entry}:null;
}
async function metaSigned(raw,header,secret){
  if(!secret||secret.length<20||!/^sha256=[a-f0-9]{64}$/.test(header||''))return false;
  const key=await crypto.subtle.importKey('raw',new TextEncoder().encode(secret),
    {name:'HMAC',hash:'SHA-256'},false,['verify']);
  const bytes=Uint8Array.from(header.slice(7).match(/../g).map(h=>parseInt(h,16)));
  return crypto.subtle.verify('HMAC',key,bytes,new TextEncoder().encode(raw));
}
// Only the production backend can request media. No public media proxy or caller-supplied URL.
const MEDIA_MAX=4*1024*1024;
async function downloadMetaImage(req,env){
  if(!onlyMeta(env))return error(503);
  const raw=await req.text(),ts=req.headers.get('x-dbk36-timestamp')||'',sig=req.headers.get('x-dbk36-signature')||'';
  const secret=env.DBK36_WA_PRODUCTION_BRIDGE_SECRET||'';
  if(raw.length>500||secret.length<32||!/^\d{10}$/.test(ts)||Math.abs(Date.now()/1000-Number(ts))>45||!/^[a-f0-9]{64}$/.test(sig))return error(401);
  const key=await crypto.subtle.importKey('raw',new TextEncoder().encode(secret),{name:'HMAC',hash:'SHA-256'},false,['verify']);
  const signature=Uint8Array.from(sig.match(/../g).map(x=>parseInt(x,16)));
  if(!await crypto.subtle.verify('HMAC',key,signature,new TextEncoder().encode(`${ts}.${raw}`)))return error(401);
  let data;try{data=JSON.parse(raw);}catch{return error(400);}
  if(data?.purpose!=='inbound-image'||typeof data.mediaId!=='string'||!/^\d{5,30}$/.test(data.mediaId))return error(400);
  const token=String(env.WHATSAPP_ACCESS_TOKEN||''),graph=String(env.WHATSAPP_GRAPH_VERSION||'v27.0'),phoneId=String(env.WHATSAPP_PHONE_NUMBER_ID||'');
  if(token.length<30||!/^v\d{2}\.\d{1,2}$/.test(graph)||!/^\d{8,25}$/.test(phoneId))return error(503);
  const headers={Authorization:`Bearer ${token}`};
  try{
    const meta=await fetch(`https://graph.facebook.com/${graph}/${data.mediaId}?phone_number_id=${phoneId}`,{headers,redirect:'manual',signal:AbortSignal.timeout(5000)});
    if(!meta.ok)return error(502);
    const info=await meta.json();
    if(!['image/jpeg','image/png'].includes(info.mime_type)||!Number.isSafeInteger(info.file_size)||info.file_size<1||info.file_size>MEDIA_MAX)return error(415);
    const url=new URL(info.url);
    if(url.protocol!=='https:'||url.hostname!=='lookaside.fbsbx.com'||url.username||url.password||url.port)return error(502);
    const res=await fetch(url,{headers,redirect:'manual',signal:AbortSignal.timeout(7000)});
    if(!res.ok||res.headers.get('content-type')?.split(';')[0]!==info.mime_type||!res.body)return error(502);
    const reader=res.body.getReader();let length=0;const chunks=[];
    while(true){const {done,value}=await reader.read();if(done)break;length+=value.byteLength;if(length>MEDIA_MAX){await reader.cancel();return error(413);}chunks.push(value);}
    if(length!==info.file_size)return error(502);
    const bytes=new Uint8Array(length);let offset=0;for(const part of chunks){bytes.set(part,offset);offset+=part.byteLength;}
    const jpeg=length>=3&&bytes[0]===255&&bytes[1]===216&&bytes[2]===255;
    const png=length>=8&&[137,80,78,71,13,10,26,10].every((v,i)=>bytes[i]===v);
    if(info.mime_type==='image/jpeg'?!jpeg:!png)return error(415);
    if(typeof info.sha256==='string'&&/^[a-f0-9]{64}$/i.test(info.sha256)){
      const digest=[...new Uint8Array(await crypto.subtle.digest('SHA-256',bytes))].map(x=>x.toString(16).padStart(2,'0')).join('');if(digest!==info.sha256.toLowerCase())return error(502);
    }
    return new Response(bytes,{headers:{...cache,'Content-Type':info.mime_type}});
  }catch{return error(502);}
}
export default {
  async fetch(req,env){
    const url=new URL(req.url);
    if(req.method==='GET'&&url.pathname==='/__dbk36/health')
      return Response.json({service:'dbk36-whatsapp-production',installed:configured(env),
        whatsappEnabled:onlyMeta(env),provider:onlyMeta(env)?'meta':'disabled',
        callbackEnabled:env.DBK36_PRODUCTION_MPESA_CALLBACK_ENABLED==='YES'},
        {headers:cache});
    if(!configured(env))return error();
    if(req.method==='POST'&&url.pathname==='/__dbk36/media')return downloadMetaImage(req,env);
    // PRIVATE outbound boundary. A verified HMAC from the production backend
    // is required. No public chatbot or YCloud fallback is permitted.
    if(req.method==='POST'&&url.pathname==='/__dbk36/send'){
      if(!onlyMeta(env))return error(503);
      const raw=await req.text();
      if(raw.length>6000)return error(413);
      const ts=req.headers.get('x-dbk36-timestamp')||'';
      const sig=req.headers.get('x-dbk36-signature')||'';
      const secret=env.DBK36_WA_PRODUCTION_BRIDGE_SECRET||'';
      if(secret.length<32||!/^\d{10}$/.test(ts)||Math.abs(Date.now()/1000-Number(ts))>45||
        !/^[a-f0-9]{64}$/.test(sig))return error(401);
      const key=await crypto.subtle.importKey('raw',new TextEncoder().encode(secret),
        {name:'HMAC',hash:'SHA-256'},false,['verify']);
      const signature=Uint8Array.from(sig.match(/../g).map(x=>parseInt(x,16)));
      if(!await crypto.subtle.verify('HMAC',key,signature,new TextEncoder().encode(`${ts}.${raw}`)))return error(401);
      let data;try{data=JSON.parse(raw);}catch{return error(400);}
      const to=String(data?.to||'');
      if(!validPhone(to)||!allowed(to,env)||typeof data.text!=='string'||
        !data.text.trim()||data.text.length>3500)return error(validPhone(to)?403:400);
      const phoneId=String(env.WHATSAPP_PHONE_NUMBER_ID||'');
      const token=String(env.WHATSAPP_ACCESS_TOKEN||'');
      const graph=String(env.WHATSAPP_GRAPH_VERSION||'v27.0');
      if(!/^\d{8,25}$/.test(phoneId)||token.length<30||!/^v\d{2}\.\d{1,2}$/.test(graph))return error(503);
      try{
        const result=await fetch(`https://graph.facebook.com/${graph}/${phoneId}/messages`,{
          method:'POST',redirect:'manual',
          headers:{'Authorization':`Bearer ${token}`,'Content-Type':'application/json'},
          body:JSON.stringify({messaging_product:'whatsapp',messaging_account_id:env.WHATSAPP_WABA_ID,recipient_type:'individual',
            to,/* DBK155_META_IMAGE_PAYLOAD */ ...(() => {
          if (data.imageUrl === undefined) return {type:'text',text:{preview_url:false,body:data.text}};
          if (typeof data.imageUrl !== 'string' || data.imageUrl.length > 1500 || data.text.length > 1024) throw new Error('DBK155_MEDIA_INVALID');
          const image = new URL(data.imageUrl);
          if (image.protocol !== 'https:' || image.hostname !== 'cdn.sanity.io' || image.username || image.password || image.port || !image.pathname.startsWith('/images/')) throw new Error('DBK155_MEDIA_INVALID');
          return {type:'image',image:{link:image.toString(),caption:data.text}};
        })()}),
        });
        const response=await result.json().catch(()=>null);
        if(!result.ok){
          // Deliberately omit recipient, token, and message body from logs.
          console.log('DBK36_META_SEND_REJECTED',JSON.stringify({
            httpStatus:result.status,errorCode:Number(response?.error?.code)||null}));
          return error(502);
        }
        // An HTTP 200 without a Meta message ID is not a confirmed acceptance.
        if(!/^wamid\./.test(String(response?.messages?.[0]?.id||'')))return error(502);
        return Response.json({sent:true,messageId:response.messages[0].id},{headers:cache});
      }catch{return error(502);}
    }
    if(req.method==='POST'&&url.pathname==='/api/whatsapp/stk/callback'){
      if(env.DBK36_PRODUCTION_MPESA_CALLBACK_ENABLED!=='YES')return error();
      const raw=await req.text();
      if(raw.length>32768)return error(413);
      try{return await relay(raw,'/api/whatsapp/production-callback',env);}
      catch{return error(503);}
    }
    if(url.pathname==='/api/whatsapp/webhook'){
      if(!onlyMeta(env))return error();
      if(req.method==='GET'){
        const expected=env.WHATSAPP_VERIFY_TOKEN||'';
        const challenge=url.searchParams.get('hub.challenge')||'';
        if(expected.length<24||url.searchParams.get('hub.mode')!=='subscribe'||
          url.searchParams.get('hub.verify_token')!==expected||challenge.length>200||!challenge)
          return error(403);
        return new Response(challenge,{status:200,headers:cache});
      }
      if(req.method==='POST'){
        const raw=await req.text();
        if(raw.length>45000)return error(413);
        const sig=req.headers.get('x-hub-signature-256')||'';
        if(!await metaSigned(raw,sig,env.WHATSAPP_APP_SECRET))return error(401);
        const stats={received:0,forwarded:0,wabaMismatch:0,phoneMismatch:0,unsupportedSender:0,notAllowed:0,invalidId:0,unsupportedMessage:0};
        const permitted=filterMetaInbound(raw,env,stats);
        if(stats.received||stats.wabaMismatch||stats.phoneMismatch)console.info('DBK177_META_INGRESS',stats);
        // Acknowledge signed delivery/status webhooks even when bot is restricted.
        if(!permitted)return Response.json({received:true,queued:false},{headers:cache});
        try{const response=await relay(JSON.stringify(permitted),'/api/whatsapp/production-webhook',env);console.info('DBK177_META_RELAY',{status:response.status,forwarded:stats.forwarded});return response;}
        catch{console.warn('DBK177_META_RELAY_FAILED');return error(503);}
      }
    }
    return error();
  },
  async scheduled(event,env){
    if(!configured(env))return;
    if(event.cron==='*/30 * * * *'&&env.DBK36_PRODUCTION_CATALOGUE_REFRESH_ENABLED==='YES'){
      const res=await relay('{"job":"catalogue"}','/api/whatsapp/production-catalogue',env);
      if(!res.ok)throw new Error('DBK36_PRODUCTION_CATALOGUE_REFRESH_DEFERRED');
    }
    if(event.cron==='*/5 * * * *'&&onlyMeta(env)&&
       env.DBK36_PRODUCTION_MESSAGE_RECOVERY_ENABLED==='YES'){
      const res=await relay('{"job":"messages"}','/api/whatsapp/production-queue',env);
      if(!res.ok)throw new Error('DBK36_PRODUCTION_MESSAGE_RECOVERY_DEFERRED');
    }
    if(event.cron==='*/5 * * * *'&&env.DBK36_PRODUCTION_RECONCILE_ENABLED==='YES'){
      const res=await relay('{"job":"recover"}','/api/whatsapp/production-reconcile',env);
      if(!res.ok)throw new Error('DBK36_PRODUCTION_RECONCILIATION_DEFERRED');
    }
  },
};
