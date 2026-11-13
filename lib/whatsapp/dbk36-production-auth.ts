import 'server-only';
import {createHmac,timingSafeEqual} from 'node:crypto';
const MAIN_HOST='ep-steep-scene-bausr4ct-pooler.c-8.eu-central-1.aws.neon.tech';
/** Service-to-service auth for the dedicated Cloudflare production Worker only. */
export function productionBridgeEnabled(){
  const e=process.env;
  let u:URL;
  try{u=new URL(e.DATABASE_URL||'');}catch{return false;}
  return e.VERCEL_ENV==='production'&&e.DBK36_WA_PRODUCTION_BRIDGE_ENABLED==='YES'&&
    e.DBK36_STAGING_WORKER!=='YES'&&e.DBK36_WA_PAID_INTAKE_ENABLED==='YES'&&
    ['postgres:','postgresql:'].includes(u.protocol)&&u.hostname===MAIN_HOST&&
    u.pathname==='/neondb'&&u.searchParams.get('sslmode')==='require'&&Boolean(u.password);
}
export function signedInternalRequest(headers:Headers,body:string){
  const secret=process.env.DBK36_WA_PRODUCTION_BRIDGE_SECRET||'';
  if(!productionBridgeEnabled()||secret.length<32)return false;
  const stamp=headers.get('x-dbk36-timestamp')||'';
  const hash=headers.get('x-dbk36-signature')||'';
  if(!/^\d{10}$/.test(stamp)||!/^\w{64}$/.test(hash)||
     Math.abs(Date.now()/1000-Number(stamp))>45||Buffer.byteLength(body)>45000)return false;
  const expected=createHmac('sha256',secret).update(`${stamp}.${body}`).digest();
  const actual=Buffer.from(hash,'hex');
  return expected.length===actual.length&&timingSafeEqual(expected,actual);
}
