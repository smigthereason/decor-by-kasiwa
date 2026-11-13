/** DBK-36 dedicated PRODUCTION WhatsApp perimeter. Never connects to staging Neon.
 * All payments/stock are handled by the verified main-Vercel backend.
 * Public WhatsApp and checkout gates are OFF until official number onboarding.
 */
const base='https://decorbykasiwa.co.ke';
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
        whatsappEnabled:env.DBK36_PRODUCTION_META_ENABLED==='YES',
        callbackEnabled:env.DBK36_PRODUCTION_MPESA_CALLBACK_ENABLED==='YES'},
        {headers:cache});
    if(!configured(env))return error();
    // PRIVATE outbound boundary. Server signs exact body with the bridge HMAC;
    // this Worker alone holds tomorrow's Meta token and phone ID.
    if(req.method==='POST'&&url.pathname==='/__dbk36/send'){
      if(env.DBK36_PRODUCTION_META_ENABLED!=='YES')return error(503);
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
      if(!/^254(?:7|1)\d{8}$/.test(data.to||'')||typeof data.text!=='string'||
         !data.text.trim()||data.text.length>3500)return error(400);
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
    if(event.cron==='*/5 * * * *'&&env.DBK36_PRODUCTION_META_ENABLED==='YES'&&
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
