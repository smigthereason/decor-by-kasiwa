import 'server-only';
import { createHash } from 'node:crypto';

/** Per-runtime protection only. No payment POST is automatically retried. */
type Credentials = { baseUrl: string; consumerKey: string; consumerSecret: string };
type State = { token?: string; expiresAt: number; blockedUntil: number; pending?: Promise<string> };
const states = new Map<string, State>();
function account(c: Credentials): State {
  if (!['https://api.safaricom.co.ke','https://sandbox.safaricom.co.ke'].includes(c.baseUrl)) throw Error('DARAJA_HOST_INVALID');
  const key = createHash('sha256').update(JSON.stringify([c.baseUrl,c.consumerKey,c.consumerSecret])).digest('hex');
  let state=states.get(key);
  if(!state){state={expiresAt:0,blockedUntil:0};states.set(key,state);}
  return state;
}
export function assertDarajaAvailable(c: Credentials) {
  if(account(c).blockedUntil>Date.now()) throw Error('DARAJA_PROVIDER_COOLDOWN');
}
function throttle(s: State, response: Response) {
  if(response.status!==429)return;
  const raw=response.headers.get('retry-after');
  const seconds=raw&&/^\d+$/.test(raw)?Number(raw)*1000:raw?Date.parse(raw)-Date.now():NaN;
  const duration=Number.isFinite(seconds)?Math.max(30000,seconds):60000;
  s.blockedUntil=Math.max(s.blockedUntil,Date.now()+duration);
}
export async function darajaFetch(c: Credentials, path:string, init:RequestInit):Promise<Response>{
  const s=account(c);
  assertDarajaAvailable(c);
  let response:Response;
  try{response=await fetch(c.baseUrl+path,{...init,cache:'no-store',redirect:'error'});}
  catch(error){
    s.blockedUntil=Math.max(s.blockedUntil,Date.now()+15000);
    const code=(error as {cause?:{code?:unknown}}|null)?.cause?.code;
    console.warn('DBK173_DARAJA_NETWORK',{stage:path.startsWith('/oauth/')?'oauth':path.includes('stkpushquery')?'query':'stk',code:typeof code==='string'&&/^[A-Z0-9_]{1,40}$/.test(code)?code:undefined});
    throw error;
  }
  throttle(s,response);
  if(response.status===401&&!path.startsWith('/oauth/')){s.token=undefined;s.expiresAt=0;}
  if(!response.ok)console.warn('DBK173_DARAJA_HTTP',{stage:path.startsWith('/oauth/')?'oauth':path.includes('stkpushquery')?'query':'stk',status:response.status});
  return response;
}
export async function getDarajaToken(c:Credentials):Promise<string>{
  const s=account(c);
  assertDarajaAvailable(c);
  if(s.token&&s.expiresAt>Date.now())return s.token;
  if(s.pending)return s.pending;
  const pending=(async()=>{
    const started=Date.now();
    const response=await darajaFetch(c,'/oauth/v1/generate?grant_type=client_credentials',{
      method:'GET',signal:AbortSignal.timeout(12000),headers:{Authorization:'Basic '+Buffer.from(c.consumerKey+':'+c.consumerSecret).toString('base64')}});
    const body=await response.json().catch(()=>null) as {access_token?:string;expires_in?:string|number}|null;
    if(!response.ok||typeof body?.access_token!=='string'||!body.access_token){
      s.blockedUntil=Math.max(s.blockedUntil,Date.now()+15000);
      throw Error(`DARAJA_OAUTH_HTTP_${response.status}`);
    }
    const seconds=Number(body.expires_in);
    // Never invent an expiry when the provider did not specify it.
    if(Number.isFinite(seconds)&&seconds>60){s.token=body.access_token;s.expiresAt=started+(Math.min(seconds,3600)-60)*1000;}
    return body.access_token;
  })();
  s.pending=pending;
  try{return await pending;}finally{if(s.pending===pending)s.pending=undefined;}
}
