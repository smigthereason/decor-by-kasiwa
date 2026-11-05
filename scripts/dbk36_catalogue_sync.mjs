/** Run on the isolated DBK-36 local server; no direct Sanity writes. */
const env = process.env;
const db = new URL(env.DATABASE_URL || 'postgresql://invalid');
if (!db.hostname.endsWith('.neon.tech') || db.hostname.startsWith('ep-steep-scene-bausr4ct'))
  throw new Error('STOP: DBK-36 catalogue sync must use the isolated Neon test branch');
if (!env.WHATSAPP_WORKER_SECRET || !env.WHATSAPP_TEST_RECIPIENTS)
  throw new Error('STOP: Missing private test configuration');
const response = await fetch('http://127.0.0.1:3100/api/whatsapp/catalogue/sync',{
  method:'POST',
  headers:{Authorization:`Bearer ${env.WHATSAPP_WORKER_SECRET}`},
  signal:AbortSignal.timeout(60000),
});
const result=await response.json();
console.log('DBK-36 catalogue sync HTTP:',response.status);
console.log('DBK-36 catalogue sync result:',result);
if (!response.ok || !result.ok) process.exitCode=1;
