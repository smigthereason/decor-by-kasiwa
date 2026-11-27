import {NextRequest,NextResponse} from 'next/server';
import {neon} from '@neondatabase/serverless';
import {getApiStaff} from '@/lib/auth/api-authorization';
import {whatsappAccess,whatsappRoles} from '@/lib/whatsapp/dbk169-access';
import {serverClient} from '@/sanity/lib/serverClient';
import {ensureInboundImage} from '@/lib/whatsapp/dbk166-inbound-media';
import {deliverRecordedWhatsApp} from '@/lib/whatsapp/dbk36-production-messages';
export const dynamic='force-dynamic'; export const runtime='nodejs'; export const maxDuration=30;
const out=(data:unknown,status=200)=>NextResponse.json(data,{status,headers:{'Cache-Control':'private, no-store'}});
type Employee={_id:string;name:string;role:string;status:string;permissions?:string[]};
const eligibleQuery=`*[_type=='customerUser' && !(_id in path('drafts.**')) && status=='ACTIVE' && (role=='ADMIN' || (role in ['MANAGER','STORE','STORE_STAFF'] && 'WHATSAPP_SALES' in permissions))] | order(name asc){_id,name,role}`;
const employee=(id:string)=>serverClient.fetch<Employee|null>(`*[_type=='customerUser' && _id==$id && !(_id in path('drafts.**'))][0]{_id,name,role,status,permissions}`,{id},{cache:'no-store'});
const waPattern=/^(?:254(?:7|1)\d{8}|[A-Z]{2}\.[0-9]{6,32})$/;
const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const db=()=>neon(process.env.DATABASE_URL!);
async function authorized(){
  const staff=await getApiStaff([...whatsappRoles]);
  if(!staff.ok)return null;
  const customer=await employee(staff.customerId);
  if(!customer||customer.role!==staff.role)return null;
  const access=whatsappAccess(customer.role,customer.status,customer.permissions);
  return access?{...staff,customerName:customer.name||staff.customerName,access}:null;
}
export async function GET(req:NextRequest){try{
  const staff=await authorized();if(!staff)return out({error:'ACCESS_DENIED'},403);
  if(req.nextUrl.searchParams.get('access')==='1')return out({allowed:true});
  const {admin,queue,transfer,supervise}=staff.access, id=staff.customerId, sql=db();
  const media=req.nextUrl.searchParams.get('media');
  if(media){
    if(!uuid.test(media))return out({error:'INVALID_MEDIA'},400);
    const access=(team:boolean)=>sql`SELECT m.id FROM public.dbk36_wa_messages m JOIN public.dbk36_wa_conversations c ON c.wa_id=m.wa_id WHERE m.id=${media}::uuid AND m.direction='in' AND m.message_type='image' AND (${team} OR c.staff_owner_id=${id})`;
    if(!(await access(supervise)).length)return out({error:'ACCESS_DENIED'},403);
    const image=await ensureInboundImage(media);
    const fresh=await authorized();
    if(!fresh||fresh.customerId!==id||!(await access(fresh.access.supervise)).length)return out({error:'ACCESS_DENIED'},403);
    if(!image)return out({error:'MEDIA_UNAVAILABLE'},404);
    return new Response(new Uint8Array(Buffer.from(image.data,'base64')),{headers:{'Content-Type':image.mime,'Cache-Control':'private, no-store','X-Content-Type-Options':'nosniff','Content-Security-Policy':"default-src 'none'; sandbox"}});
  }
  const wa=req.nextUrl.searchParams.get('wa');
  if(wa){
    if(!waPattern.test(wa))return out({error:'INVALID_CONVERSATION'},400);
    const scope=await sql`SELECT wa_id,mode,staff_owner_id,staff_owner_name,staff_review_reason,delivery_context,reply_lock IS NOT NULL AS busy,last_inbound_at, (SELECT m.id::text FROM public.dbk36_wa_messages m WHERE m.wa_id=c.wa_id AND m.direction='in' ORDER BY m.created_at DESC,m.id DESC LIMIT 1) AS latest_inbound_id FROM public.dbk36_wa_conversations c WHERE wa_id=${wa} AND (${supervise} OR staff_owner_id=${id})`;
    if(!scope.length){
      // Shared queue exposes only a summary before ownership is claimed, never history, media, cart or payments.
      if(!queue)return out({error:'ACCESS_DENIED'},403);
      const preview=await sql`SELECT wa_id,mode,staff_owner_id,staff_owner_name,staff_review_reason,last_inbound_at,reply_lock IS NOT NULL AS busy FROM public.dbk36_wa_conversations WHERE wa_id=${wa} AND staff_owner_id IS NULL`;
      if(!preview.length)return out({error:'ACCESS_DENIED'},403);
      return out({conversation:preview[0],messages:[],cart:[],orders:[],audit:[],preview:true});
    }
    const [messages,cart,orders,audit]=await Promise.all([
      sql`SELECT * FROM (
        SELECT m.id::text AS id,m.direction,m.message_text AS text,m.status,m.created_at,CASE WHEN m.direction='in' AND m.message_type='image' AND m.media_id IS NOT NULL THEN '/api/backoffice/whatsapp/inbox?media='||m.id::text ELSE NULL END AS image_url,m.provider_message_id AS provider_id,m.context_provider_id,CASE WHEN m.direction='in' THEN 'Customer' ELSE 'Legacy' END AS actor_name
        FROM public.dbk36_wa_messages m JOIN public.dbk36_wa_conversations c ON c.wa_id=m.wa_id WHERE m.wa_id=${wa} AND (${supervise} OR c.staff_owner_id=${id})
        UNION ALL SELECT o.request_id,'out',o.message_text,o.status,o.created_at,o.image_url,o.provider_message_id AS provider_id,NULL::text AS context_provider_id,CASE WHEN o.actor_id IN ('AI','SYSTEM_PAYMENT') THEN 'Kasiwa' ELSE o.actor_name END AS actor_name FROM public.dbk159_wa_outbound o JOIN public.dbk36_wa_conversations c ON c.wa_id=o.wa_id WHERE o.wa_id=${wa} AND (${supervise} OR c.staff_owner_id=${id})
      ) h ORDER BY created_at DESC,id DESC LIMIT 100`,
      sql`SELECT i.product_id,i.variant_id,i.quantity,p.value->>'name' AS name FROM public.dbk36_wa_cart_items i JOIN public.dbk36_wa_conversations c ON c.wa_id=i.wa_id LEFT JOIN public.dbk36_wa_catalogue_cache cache ON cache.cache_key='ecommerce' LEFT JOIN LATERAL (SELECT value FROM jsonb_array_elements(cache.products_json) WHERE value->>'id'=i.product_id LIMIT 1) p ON true WHERE i.wa_id=${wa} AND (${supervise} OR c.staff_owner_id=${id}) LIMIT 12`,
      sql`SELECT o.reference,o.amount_kes,o.status,o.stock_state,o.updated_at FROM public.dbk36_wa_prod_payment_orders o JOIN public.dbk36_wa_conversations c ON c.wa_id=o.wa_id WHERE o.wa_id=${wa} AND (${supervise} OR c.staff_owner_id=${id}) ORDER BY o.created_at DESC LIMIT 10`,
      supervise?sql`SELECT action,actor_id,owner_id,created_at FROM public.dbk159_wa_assignment_audit WHERE wa_id=${wa} ORDER BY id DESC LIMIT 20`:Promise.resolve([])
    ]);
    return out({conversation:scope[0],messages:messages.reverse(),cart,orders,audit});
  }
  const q=(req.nextUrl.searchParams.get('q')||'').slice(0,80);
  const bucket=req.nextUrl.searchParams.get('bucket')||'all';
  if(!['all','mine','waiting','attention','unread','ai'].includes(bucket))return out({error:'INVALID_QUEUE_FILTER'},400);
  const conversations=await sql`SELECT c.wa_id,c.mode,c.staff_owner_id,c.staff_owner_name,c.staff_review_reason,c.last_inbound_at,c.reply_lock IS NOT NULL AS busy,
    CASE WHEN ${supervise} OR c.staff_owner_id=${id} THEN latest.message_text ELSE left(latest.message_text,120) END AS last_message, latest.id AS latest_inbound_id,
    (latest.id IS NOT NULL AND seen.last_read_message_id IS DISTINCT FROM latest.id) AS unread,
    (c.staff_review_reason IS NOT NULL OR (c.mode='human' AND c.last_inbound_at>COALESCE((SELECT max(o.created_at) FROM public.dbk159_wa_outbound o WHERE o.wa_id=c.wa_id AND o.actor_id NOT IN ('AI','SYSTEM_PAYMENT') AND o.status='accepted'),'-infinity'::timestamptz))) AS needs_reply
    FROM public.dbk36_wa_conversations c
    LEFT JOIN LATERAL (SELECT m.id::text AS id,m.message_text FROM public.dbk36_wa_messages m WHERE m.wa_id=c.wa_id AND m.direction='in' ORDER BY m.created_at DESC,m.id DESC LIMIT 1) latest ON true
    LEFT JOIN public.dbk163_wa_staff_read seen ON seen.wa_id=c.wa_id AND seen.staff_id=${id}
    WHERE (${supervise} OR c.staff_owner_id=${id} OR (${queue} AND c.staff_owner_id IS NULL)) AND (${q}='' OR strpos(lower(c.wa_id),lower(${q}))>0 OR strpos(lower(coalesce(c.staff_owner_name,'')),lower(${q}))>0)
    AND (${bucket}='all' OR (${bucket}='mine' AND c.staff_owner_id=${id}) OR (${bucket}='waiting' AND c.staff_owner_id IS NULL) OR (${bucket}='attention' AND (c.staff_review_reason IS NOT NULL OR (c.mode='human' AND c.last_inbound_at>COALESCE((SELECT max(o.created_at) FROM public.dbk159_wa_outbound o WHERE o.wa_id=c.wa_id AND o.actor_id NOT IN ('AI','SYSTEM_PAYMENT') AND o.status='accepted'),'-infinity'::timestamptz)))) OR (${bucket}='unread' AND latest.id IS NOT NULL AND seen.last_read_message_id IS DISTINCT FROM latest.id) OR (${bucket}='ai' AND c.mode='bot'))
    ORDER BY (c.staff_review_reason IS NOT NULL OR (c.mode='human' AND c.staff_owner_id IS NULL)) DESC,c.last_inbound_at DESC NULLS LAST LIMIT 100`;
  const eligible=transfer?await serverClient.fetch<Array<{_id:string;name:string;role:string}>>(eligibleQuery,{}, {cache:'no-store'}):[];
  return out({conversations,eligible,viewer:{id,admin,queue,transfer,supervise}});
}catch{return out({error:'INBOX_UNAVAILABLE'},503);}}
export async function POST(req:NextRequest){try{
  const staff=await authorized();if(!staff)return out({error:'ACCESS_DENIED'},403);
  if(req.headers.get('origin')!==req.nextUrl.origin||req.headers.get('content-type')?.split(';')[0].trim()!=='application/json')return out({error:'ORIGIN_DENIED'},403);
  const raw=await req.text();if(raw.length>12000)return out({error:'TOO_LARGE'},413);
  const body=JSON.parse(raw);const wa=body?.wa;
  if(typeof wa!=='string'||!waPattern.test(wa))return out({error:'INVALID_CONVERSATION'},400);
  const {queue,transfer,supervise}=staff.access, id=staff.customerId, sql=db();
  if(body.action==='read'){
    if(typeof body.messageId!=='string'||!body.messageId||body.messageId.length>180)return out({error:'INVALID_READ_MARKER'},400);
    // Only mark the latest inbound message that the authorized viewer actually opened.
    const marked=await sql`INSERT INTO public.dbk163_wa_staff_read(wa_id,staff_id,last_read_message_id)
      SELECT c.wa_id,${id},${body.messageId} FROM public.dbk36_wa_conversations c
      WHERE c.wa_id=${wa} AND (${supervise} OR c.staff_owner_id=${id}) AND ${body.messageId}=(SELECT m.id::text FROM public.dbk36_wa_messages m WHERE m.wa_id=c.wa_id AND m.direction='in' ORDER BY m.created_at DESC,m.id DESC LIMIT 1)
      ON CONFLICT(wa_id,staff_id) DO UPDATE SET last_read_message_id=EXCLUDED.last_read_message_id,updated_at=now() RETURNING wa_id`;
    return out({ok:true,marked:marked.length===1});
  }
  if(body.action==='claim'||body.action==='assign'||body.action==='transfer'){
    const claim=body.action==='claim', assigning=body.action==='assign';
    if(claim?!queue:assigning?!supervise:!transfer)return out({error:'ACCESS_DENIED'},403);
    const expected=claim?null:body.expectedOwner;
    if(expected!==null&&(typeof expected!=='string'||!expected||expected.length>200))return out({error:'INVALID_EXPECTED_OWNER'},400);
    if(!claim&&!assigning&&expected!==id)return out({error:'NOT_YOUR_CONVERSATION'},403);
    const owner=claim?await employee(id):typeof body.owner==='string'&&body.owner.length<=200?await employee(body.owner):null;
    if(!owner||!whatsappAccess(owner.role,owner.status,owner.permissions))return out({error:'INVALID_ASSIGNEE'},400);
    if(claim&&(owner._id!==id||owner.role!==staff.role||!whatsappAccess(owner.role,owner.status,owner.permissions)?.queue))return out({error:'ACCESS_DENIED'},403);
    if(!claim&&!assigning&&owner._id===id)return out({error:'ALREADY_ASSIGNED'},400);
    // Ownership comparison and reply lock are checked in the same atomic UPDATE. A racing claim loses safely.
    const rows=await sql`WITH changed AS (UPDATE public.dbk36_wa_conversations SET mode='human',staff_owner_id=${owner._id},staff_owner_name=${owner.name||'Staff'},updated_at=now() WHERE wa_id=${wa} AND reply_lock IS NULL AND staff_owner_id IS NOT DISTINCT FROM ${expected}::text AND (${claim} OR ${supervise} OR staff_owner_id=${id}) RETURNING wa_id,staff_owner_id),
      drained AS (UPDATE public.dbk36_wa_messages m SET status='done',updated_at=now() FROM changed WHERE m.wa_id=changed.wa_id AND m.direction='in' AND m.status='pending' RETURNING m.id)
      INSERT INTO public.dbk159_wa_assignment_audit(wa_id,actor_id,action,owner_id) SELECT wa_id,${id},'assign',staff_owner_id FROM changed RETURNING id`;
    return rows.length?out({ok:true}):out({error:'OWNERSHIP_CHANGED_OR_BUSY_REFRESH'},409);
  }
  if(body.action==='resume'){
    const expected=body.expectedOwner;
    if(expected!==null&&(typeof expected!=='string'||!expected||expected.length>200))return out({error:'INVALID_EXPECTED_OWNER'},400);
    const rows=await sql`WITH changed AS (UPDATE public.dbk36_wa_conversations SET mode='bot',staff_owner_id=NULL,staff_owner_name=NULL,staff_review_reason=NULL,updated_at=now() WHERE wa_id=${wa} AND reply_lock IS NULL AND mode='human' AND staff_owner_id IS NOT DISTINCT FROM ${expected}::text AND (${supervise} OR staff_owner_id=${id}) RETURNING wa_id),
      drained AS (UPDATE public.dbk36_wa_messages m SET status='done',updated_at=now() FROM changed WHERE m.wa_id=changed.wa_id AND m.direction='in' AND m.status='pending' RETURNING m.id)
      INSERT INTO public.dbk159_wa_assignment_audit(wa_id,actor_id,action) SELECT wa_id,${id},'resume' FROM changed RETURNING id`;
    return rows.length?out({ok:true}):out({error:'BUSY_OR_NOT_ASSIGNED'},409);
  }
  if(body.action!=='send'||typeof body.text!=='string'||!body.text.trim()||body.text.length>3500||typeof body.requestId!=='string'||!uuid.test(body.requestId))return out({error:'INVALID_MESSAGE'},400);
  const key='staff:'+body.requestId, message=body.text.trim();
  // Staff can only send in an active customer-initiated window. The Worker retains recipient allowlisting.
  // Atomic claim + attempt reservation; duplicate UUID rolls the entire statement back.
  const claimed=await sql`WITH locked AS (UPDATE public.dbk36_wa_conversations SET reply_lock=${key},reply_locked_at=now() WHERE wa_id=${wa} AND mode='human' AND staff_owner_id=${id} AND reply_lock IS NULL
    AND NOT EXISTS(SELECT 1 FROM public.dbk159_wa_outbound o WHERE o.request_id=${key})
    AND EXISTS(SELECT 1 FROM public.dbk36_wa_messages m WHERE m.wa_id=${wa} AND m.direction='in' AND m.created_at>now()-interval '24 hours') RETURNING wa_id)
    INSERT INTO public.dbk159_wa_outbound(request_id,wa_id,actor_id,actor_name,message_text,status) SELECT ${key},wa_id,${id},${staff.customerName},${message},'sending' FROM locked RETURNING request_id`;
  if(!claimed.length)return out({error:'BUSY_NOT_ASSIGNED_OR_WINDOW_CLOSED'},409);
  try{await deliverRecordedWhatsApp(wa,key,message);return out({ok:true,status:'accepted'});}
  catch{return out({error:'SEND_UNCERTAIN_CHECK_HISTORY_DO_NOT_RETRY'},502);}
  finally{await sql`UPDATE public.dbk36_wa_conversations SET reply_lock=NULL,reply_locked_at=NULL WHERE wa_id=${wa} AND reply_lock=${key}`;}
}catch{return out({error:'INBOX_ACTION_FAILED_CHECK_HISTORY'},503);}}
