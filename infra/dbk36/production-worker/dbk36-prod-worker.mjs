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
/** YCloud signs `{unix_seconds}.{exact_raw_body}` with a per-endpoint webhook secret.
 * This is NOT Meta's x-hub-signature-256 scheme. Never log event bodies.
 */
async function ycloudSigned(raw,header,secret){
  if(!secret||secret.length<24||!header)return false;
  const parts=Object.fromEntries(header.split(',').map(x=>x.trim().split('=')));
  const stamp=parts.t||'',sig=parts.s||'';
  if(!/^\d{10}$/.test(stamp)||!/^[a-f0-9]{64}$/i.test(sig)||
    Math.abs(Date.now()/1000-Number(stamp))>300)return false;
  const expected=await sign(stamp,raw,secret);
  const a=new Uint8Array(expected.match(/../g).map(x=>parseInt(x,16)));
  const b=new Uint8Array(sig.match(/../g).map(x=>parseInt(x,16)));
  // Constant-work comparison: do not leak a matching prefix.
  let difference=0;
  for(let i=0;i<a.length;i++)difference|=a[i]^b[i];
  return difference===0;
}
function ycloudEventToMeta(event,env){
  if(event?.type!=='whatsapp.inbound_message.received')return null;
  const m=event.whatsappInboundMessage;
  if(!m||m.type!=='text')return null;
  const normalPhone=x=>String(x||'').replace(/[^0-9]/g,'');
  // Phone numbers and Business-Scoped User IDs (BSUIDs) are *different*
  // identities. Never turn the numeric portion of a BSUID into a phone number.
  const phoneSender=normalPhone(m.from);
  const bsuid=String(m.fromUserId||'');
  const phoneValid=/^254(?:7|1)\d{8}$/.test(phoneSender);
  const bsuidValid=/^[A-Z]{2}\.[0-9]{6,32}$/.test(bsuid);
  const sender=phoneValid?phoneSender:(!m.from&&bsuidValid?bsuid:'');
  const dest=normalPhone(m.to);
  if(!sender||dest!=='254117553747')return null;
  if(String(m.wabaId||'')!==env.DBK36_YCLOUD_EXPECTED_WABA_ID)return null;
  const permitted=String(env.DBK36_YCLOUD_TEST_NUMBERS||'').split(',').map(normalPhone).filter(Boolean);
  const bsuidPermitted=String(env.DBK36_YCLOUD_TEST_BSUIDS||'').split(',').map(x=>x.trim()).filter(Boolean);
  if(env.DBK36_YCLOUD_PUBLIC_BOT!=='YES'&&
    !(phoneValid?permitted.includes(sender):bsuidPermitted.includes(sender)))return null;
  const messageId=String(m.wamid||'');
  const text=String(m.text?.body||'').trim().slice(0,500);
  if(!/^wamid\.[\w:=+/.-]{8,200}$/.test(messageId)||!text)return null;
  const phoneId=env.DBK36_YCLOUD_META_PHONE_NUMBER_ID||'';
  if(!/^\d{8,25}$/.test(phoneId))return null;
  return {object:'whatsapp_business_account',entry:[{changes:[{field:'messages',value:{
    metadata:{phone_number_id:phoneId},messages:[{id:messageId,from:sender,type:'text',text:{body:text}}]
  }}]}]};
}
async function metaSigned(raw,header,secret){
  if(!secret||secret.length<20||!/^sha256=[a-f0-9]{64}$/.test(header||''))return false;
  const key=await crypto.subtle.importKey('raw',new TextEncoder().encode(secret),
    {name:'HMAC',hash:'SHA-256'},false,['verify']);
  const bytes=Uint8Array.from(header.slice(7).match(/../g).map(h=>parseInt(h,16)));
  return crypto.subtle.verify('HMAC',key,bytes,new TextEncoder().encode(raw));
}
export default {
  async fetch(req,env){
    const url=new URL(req.url);
    if(req.method==='GET'&&url.pathname==='/__dbk36/health')
      return Response.json({service:'dbk36-whatsapp-production',installed:configured(env),
        whatsappEnabled:env.DBK36_PRODUCTION_META_ENABLED==='YES'||env.DBK36_PRODUCTION_YCLOUD_ENABLED==='YES',
        callbackEnabled:env.DBK36_PRODUCTION_MPESA_CALLBACK_ENABLED==='YES'},
        {headers:cache});
    if(!configured(env))return error();
    // PRIVATE outbound boundary. Server signs exact body with the bridge HMAC;
    // this Worker alone holds tomorrow's Meta token and phone ID.
    if(req.method==='POST'&&url.pathname==='/__dbk36/send'){
      if(env.DBK36_PRODUCTION_META_ENABLED!=='YES'&&env.DBK36_PRODUCTION_YCLOUD_ENABLED!=='YES')return error(503);
      const raw=await req.text();
      if(raw.length>6000)return error(413);
      const ts=req.headers.get('x-dbk36-timestamp')||'';
      const sig=req.headers.get('x-dbk36-signature')||'';
      const secret=env.DBK36_WA_PRODUCTION_BRIDGE_SECRET||'';
      if(secret.length<32||!/^\d{10}$/.test(ts)||Math.abs(Date.now()/1000-Number(ts))>45||
        !/^[a-f0-9]{64}$/.test(sig))return error(401);
      const key=await crypto.subtle.importKey('raw',new TextEncoder().encode(secret),
        {name:'HMAC',hash:'SHA-256'},false,['verify']);
      const bytes=Uint8Array.from(sig.match(/../g).map(x=>parseInt(x,16)));
      if(!await crypto.subtle.verify('HMAC',key,bytes,new TextEncoder().encode(`${ts}.${raw}`)))return error(401);
      let data;
      try{data=JSON.parse(raw);}catch{return error(400);}
      const outboundPhone=/^254(?:7|1)\d{8}$/.test(data.to||'');
      const outboundBsuid=/^[A-Z]{2}\.[0-9]{6,32}$/.test(data.to||'');
      if((!outboundPhone&&!outboundBsuid)||typeof data.text!=='string'||
         !data.text.trim()||data.text.length>3500)return error(400);
      if(env.DBK36_PRODUCTION_YCLOUD_ENABLED==='YES'){
        // DBK36_RESTRICTED_OUTBOUND_GUARD: no BSUID is authorized by
        // phone-number allowlist membership. Explicit BSUID opt-in required.
        if(env.DBK36_YCLOUD_PUBLIC_BOT!=='YES'){
          const allowed=String(env.DBK36_YCLOUD_TEST_NUMBERS||'').split(',')
            .map(x=>x.replace(/[^0-9]/g,'')).filter(Boolean);
          const bsuidAllowed=String(env.DBK36_YCLOUD_TEST_BSUIDS||'')
            .split(',').map(x=>x.trim()).filter(Boolean);
          if(!(outboundPhone?allowed.includes(data.to):bsuidAllowed.includes(data.to)))return error(403);
        }
        const key=env.DBK36_YCLOUD_API_KEY||'';
        if(key.length<24||env.DBK36_YCLOUD_SENDER_NUMBER!=='+254117553747')return error(503);
        const y=await fetch('https://api.ycloud.com/v2/whatsapp/messages',{
          method:'POST',headers:{'X-API-Key':key,'Content-Type':'application/json'},
          body:JSON.stringify({from:env.DBK36_YCLOUD_SENDER_NUMBER,
            ...(outboundBsuid?{recipient:data.to}:{to:'+'+data.to}),
            type:'text',text:{body:data.text,preview_url:false}}),
          redirect:'manual',
        });
        // Do not retry uncertain sends: existing Neon queue flags for manual review.
        if(!y.ok)return error(502);
        const ack=await y.json().catch(()=>null);
        return ack?.id?Response.json({sent:true},{headers:cache}):error(502);
      }
      // Meta's legacy send path does not accept our YCloud BSUID routing.
      if(!outboundPhone)return error(400);
      const phoneId=env.WHATSAPP_PHONE_NUMBER_ID||'',token=env.WHATSAPP_ACCESS_TOKEN||'';
      const graph=env.WHATSAPP_GRAPH_VERSION||'v23.0';
      if(!/^\d{8,25}$/.test(phoneId)||token.length<30||!/^v\d{2}\.\d{1,2}$/.test(graph))return error(503);
      const meta=await fetch(`https://graph.facebook.com/${graph}/${phoneId}/messages`,{
        method:'POST',headers:{'Authorization':`Bearer ${token}`,'Content-Type':'application/json'},
        body:JSON.stringify({messaging_product:'whatsapp',to:data.to,type:'text',text:{body:data.text}}),
      });
      return meta.ok?Response.json({sent:true},{headers:cache}):error(502);
    }
    if(req.method==='POST'&&url.pathname==='/api/whatsapp/stk/callback'){
      if(env.DBK36_PRODUCTION_MPESA_CALLBACK_ENABLED!=='YES')return error();
      const raw=await req.text();
      if(raw.length>32768)return error(413);
      try{return await relay(raw,'/api/whatsapp/production-callback',env);}
      catch{return error(503);}
    }
    // YCloud webhook intake: signed raw body -> existing HMAC-protected Neon queue.
    // Only opted-in test senders get bot replies until the owner approves public launch.
    if(url.pathname==='/api/whatsapp/ycloud-webhook'&&req.method==='POST'){
      const raw=await req.text();
      if(raw.length>45000)return error(413);
      const secret=env.DBK36_YCLOUD_WEBHOOK_SECRET||'';
      const authenticated=await ycloudSigned(raw,req.headers.get('ycloud-signature')||'',secret);
      console.log('DBK36_YCLOUD_AUTH',authenticated?'valid':'invalid');
      if(!authenticated)return error(401);
      if(env.DBK36_PRODUCTION_YCLOUD_ENABLED!=='YES')return Response.json({received:true,bot:false},{headers:cache});
      let parsed;try{parsed=JSON.parse(raw);}catch{return error(400);}
      const converted=ycloudEventToMeta(parsed,env);
      // DBK36_YCLOUD_DIAG: temporary; no message text, identifiers or phone numbers.
      if(parsed?.type==='whatsapp.inbound_message.received'){
        const m=parsed.whatsappInboundMessage||{};
        const phone=x=>String(x||'').replace(/[^0-9]/g,'');
        const sender=phone(m.from);
        const bsuid=String(m.fromUserId||'');
        const allowed=String(env.DBK36_YCLOUD_TEST_NUMBERS||'')
          .split(',').map(phone).filter(Boolean);
        const bsuidAllowed=String(env.DBK36_YCLOUD_TEST_BSUIDS||'')
          .split(',').map(x=>x.trim()).filter(Boolean);
        console.log('DBK36_YCLOUD_DIAG',JSON.stringify({
          textType:m.type==='text',
          textPresent:Boolean(String(m.text?.body||'').trim()),
          senderFormatValid:/^254(?:7|1)\d{8}$/.test(sender),
          testNumberAllowed:allowed.includes(sender),
          bsuidFormatValid:/^[A-Z]{2}\.[0-9]{6,32}$/.test(bsuid),
          testBsuidAllowed:bsuidAllowed.includes(bsuid),
          destinationMatches:phone(m.to)==='254117553747',
          wabaMatches:String(m.wabaId||'')===env.DBK36_YCLOUD_EXPECTED_WABA_ID,
          wamidPresent:Boolean(m.wamid),
          wamidValid:/^wamid\.[\w:=+/.-]{8,200}$/.test(String(m.wamid||'')),
          alternateIdPresent:Boolean(m.id),
          phoneIdConfigured:/^\d{8,25}$/.test(env.DBK36_YCLOUD_META_PHONE_NUMBER_ID||''),
          converted:Boolean(converted)
        }));
      }
      if(!converted)return Response.json({received:true,queued:false},{headers:cache});
      try{
        const response=await relay(JSON.stringify(converted),'/api/whatsapp/production-webhook',env);
        console.log('DBK36_YCLOUD_RELAY',JSON.stringify({
          status:response.status,ok:response.ok
        }));
        return response;
      }
      catch{
        console.log('DBK36_YCLOUD_RELAY_ERROR');
        return error(503);
      }
    }
    if(url.pathname==='/api/whatsapp/webhook'){
      if(env.DBK36_PRODUCTION_META_ENABLED!=='YES')return error();
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
        if(raw.length>262144)return error(413);
        const metaSignature=req.headers.get('x-hub-signature-256')||'';
        if(!await metaSigned(raw,metaSignature,env.WHATSAPP_APP_SECRET))return error(401);
        // Forward to the dedicated MAIN Neon bot endpoint. The old staging
        // webhook and staging database are not involved.
        if(raw.length>45000)return error(413);
        try{return await relay(raw,'/api/whatsapp/production-webhook',env);}
        catch{return error(503);}
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
    if(event.cron==='*/5 * * * *'&&(env.DBK36_PRODUCTION_META_ENABLED==='YES'||env.DBK36_PRODUCTION_YCLOUD_ENABLED==='YES')&&
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
