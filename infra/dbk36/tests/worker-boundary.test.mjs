import test from 'node:test';
import assert from 'node:assert/strict';
import {createHmac,webcrypto} from 'node:crypto';
import worker from '../production-worker/dbk36-prod-worker.mjs';
if(!globalThis.crypto)globalThis.crypto=webcrypto;
const url='https://dbk36-whatsapp-production.victor-dmaina.workers.dev';
const env={DBK36_PRODUCTION_WORKER:'YES',DBK36_STAGING_WORKER:'NO',
 DBK36_PRODUCTION_BACKEND_ORIGIN:'https://decorbykasiwa.co.ke',
 DBK36_PRODUCTION_META_ENABLED:'NO',DBK36_PRODUCTION_MPESA_CALLBACK_ENABLED:'NO',
 DBK36_WA_PRODUCTION_BRIDGE_SECRET:'a'.repeat(64)};
async function call(path,method='GET',headers={},body){return worker.fetch(new Request(url+path,{method,headers,body}),env)}
test('dedicated production Worker is installed but both public gates are closed',async()=>{
 const health=await call('/__dbk36/health');assert.equal(health.status,200);
 const payload=await health.json();assert.equal(payload.whatsappEnabled,false);assert.equal(payload.callbackEnabled,false);
 assert.equal((await call('/api/whatsapp/webhook','POST',{'Content-Type':'application/json'},'{}')).status,404);
 assert.equal((await call('/api/whatsapp/stk/callback','POST',{'Content-Type':'application/json'},'{}')).status,404);
});
test('outbound Meta messages fail closed while official number is unconfigured',async()=>{
 const data=JSON.stringify({to:'254712345678',text:'Hi'});
 const stamp=String(Math.floor(Date.now()/1000));
 const signature=createHmac('sha256',env.DBK36_WA_PRODUCTION_BRIDGE_SECRET).update(`${stamp}.${data}`).digest('hex');
 const res=await call('/__dbk36/send','POST',{'x-dbk36-timestamp':stamp,'x-dbk36-signature':signature},data);
 assert.equal(res.status,503);
});
test('malformed and unsigned private Worker requests cannot send WhatsApp',async()=>{
 const original=env.DBK36_PRODUCTION_META_ENABLED;
 env.DBK36_PRODUCTION_META_ENABLED='YES';
 try{
  const res=await call('/__dbk36/send','POST',{'Content-Type':'application/json'},'{"to":"254712345678","text":"hi"}');
  assert.equal(res.status,401);
 }finally{env.DBK36_PRODUCTION_META_ENABLED=original;}
});
