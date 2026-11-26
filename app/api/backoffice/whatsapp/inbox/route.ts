import {NextRequest,NextResponse} from 'next/server';
import {neon} from '@neondatabase/serverless';
import {getApiStaff} from '@/lib/auth/api-authorization';
import {getCustomerByDocumentId} from '@/lib/auth/sanity-users';
import {serverClient} from '@/sanity/lib/serverClient';
import {deliverRecordedWhatsApp} from '@/lib/whatsapp/dbk36-production-messages';
export const dynamic='force-dynamic'; export const runtime='nodejs'; export const maxDuration=30;
const out=(data:unknown,status=200)=>NextResponse.json(data,{status,headers:{'Cache-Control':'private, no-store'}});
const roles=['ADMIN','MANAGER','STORE','STORE_STAFF'] as const;
const waPattern=/^(?:254(?:7|1)\d{8}|[A-Z]{2}\.[0-9]{6,32})$/;
const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const db=()=>neon(process.env.DATABASE_URL!);
async function authorized(){
  const staff=await getApiStaff([...roles]);
  if(!staff.ok)return null;
  if(staff.role==='ADMIN')return staff;
  const customer=await getCustomerByDocumentId(staff.customerId);
  return customer?.status==='ACTIVE'&&customer.role===staff.role&&customer.permissions?.includes('WHATSAPP_SALES')?staff:null;
}
export async function GET(req:NextRequest){try{
  const staff=await authorized();if(!staff)return out({error:'ACCESS_DENIED'},403);
  const admin=staff.role==='ADMIN', id=staff.customerId, sql=db();
  const wa=req.nextUrl.searchParams.get('wa');
  if(wa){
    if(!waPattern.test(wa))return out({error:'INVALID_CONVERSATION'},400);
    const scope=await sql`SELECT wa_id,mode,staff_owner_id,staff_owner_name,reply_lock IS NOT NULL AS busy,last_inbound_at FROM public.dbk36_wa_conversations WHERE wa_id=${wa} AND (${admin} OR staff_owner_id=${id})`;
    if(!scope.length)return out({error:'ACCESS_DENIED'},403);
    const [messages,cart,orders,audit]=await Promise.all([
      sql`SELECT * FROM (
        SELECT m.id::text AS id,m.direction,m.message_text AS text,m.status,m.created_at,NULL::text AS image_url,CASE WHEN m.direction='in' THEN 'Customer' ELSE 'Legacy' END AS actor_name
        FROM public.dbk36_wa_messages m JOIN public.dbk36_wa_conversations c ON c.wa_id=m.wa_id WHERE m.wa_id=${wa} AND (${admin} OR c.staff_owner_id=${id})
        UNION ALL SELECT o.request_id,'out',o.message_text,o.status,o.created_at,o.image_url,CASE WHEN o.actor_id IN ('AI','SYSTEM_PAYMENT') THEN 'Kasiwa' ELSE o.actor_name END AS actor_name FROM public.dbk159_wa_outbound o JOIN public.dbk36_wa_conversations c ON c.wa_id=o.wa_id WHERE o.wa_id=${wa} AND (${admin} OR c.staff_owner_id=${id})
      ) h ORDER BY created_at DESC,id DESC LIMIT 100`,
      sql`SELECT i.product_id,i.variant_id,i.quantity,p.value->>'name' AS name FROM public.dbk36_wa_cart_items i JOIN public.dbk36_wa_conversations c ON c.wa_id=i.wa_id LEFT JOIN public.dbk36_wa_catalogue_cache cache ON cache.cache_key='ecommerce' LEFT JOIN LATERAL (SELECT value FROM jsonb_array_elements(cache.products_json) WHERE value->>'id'=i.product_id LIMIT 1) p ON true WHERE i.wa_id=${wa} AND (${admin} OR c.staff_owner_id=${id}) LIMIT 12`,
      sql`SELECT o.reference,o.amount_kes,o.status,o.stock_state,o.updated_at FROM public.dbk36_wa_prod_payment_orders o JOIN public.dbk36_wa_conversations c ON c.wa_id=o.wa_id WHERE o.wa_id=${wa} AND (${admin} OR c.staff_owner_id=${id}) ORDER BY o.created_at DESC LIMIT 10`,
      admin?sql`SELECT action,actor_id,owner_id,created_at FROM public.dbk159_wa_assignment_audit WHERE wa_id=${wa} ORDER BY id DESC LIMIT 20`:Promise.resolve([])
    ]);
    return out({conversation:scope[0],messages:messages.reverse(),cart,orders,audit});
  }
  const q=(req.nextUrl.searchParams.get('q')||'').slice(0,80);
  const conversations=await sql`SELECT c.wa_id,c.mode,c.staff_owner_id,c.staff_owner_name,c.last_inbound_at,c.reply_lock IS NOT NULL AS busy,
    (SELECT m.message_text FROM public.dbk36_wa_messages m WHERE m.wa_id=c.wa_id AND m.direction='in' ORDER BY m.created_at DESC LIMIT 1) AS last_message,
    (c.mode='human' AND c.last_inbound_at>COALESCE((SELECT max(o.created_at) FROM public.dbk159_wa_outbound o WHERE o.wa_id=c.wa_id AND o.actor_id NOT IN ('AI','SYSTEM_PAYMENT') AND o.status='accepted'),'-infinity'::timestamptz)) AS needs_reply
    FROM public.dbk36_wa_conversations c WHERE (${admin} OR c.staff_owner_id=${id}) AND (${q}='' OR strpos(lower(c.wa_id),lower(${q}))>0 OR strpos(lower(coalesce(c.staff_owner_name,'')),lower(${q}))>0)
    ORDER BY (c.mode='human' AND c.staff_owner_id IS NULL) DESC,c.last_inbound_at DESC NULLS LAST LIMIT 100`;
  const eligible=admin?await serverClient.fetch<Array<{_id:string;name:string;role:string}>>(`*[_type=='customerUser' && !(_id in path('drafts.**')) && status=='ACTIVE' && (role=='ADMIN' || (role in ['MANAGER','STORE','STORE_STAFF'] && 'WHATSAPP_SALES' in permissions))] | order(name asc){_id,name,role}`,{}, {cache:'no-store'}):[];
  return out({conversations,eligible,viewer:{id,admin}});
}catch{return out({error:'INBOX_UNAVAILABLE'},503);}}
export async function POST(req:NextRequest){try{
  const staff=await authorized();if(!staff)return out({error:'ACCESS_DENIED'},403);
  if(req.headers.get('origin')!==req.nextUrl.origin||req.headers.get('content-type')?.split(';')[0].trim()!=='application/json')return out({error:'ORIGIN_DENIED'},403);
  const raw=await req.text();if(raw.length>12000)return out({error:'TOO_LARGE'},413);
  const body=JSON.parse(raw);const wa=body?.wa;
  if(typeof wa!=='string'||!waPattern.test(wa))return out({error:'INVALID_CONVERSATION'},400);
  const admin=staff.role==='ADMIN', id=staff.customerId, sql=db();
  if(body.action==='assign'){
    if(!admin)return out({error:'ADMIN_REQUIRED'},403);
    const owner=typeof body.owner==='string'?await getCustomerByDocumentId(body.owner):null;
    if(!owner||owner.status!=='ACTIVE'||!(owner.role==='ADMIN'||(['MANAGER','STORE','STORE_STAFF'].includes(owner.role)&&owner.permissions?.includes('WHATSAPP_SALES'))))return out({error:'INVALID_ASSIGNEE'},400);
    const rows=await sql`WITH changed AS (UPDATE public.dbk36_wa_conversations SET mode='human',staff_owner_id=${owner._id},staff_owner_name=${owner.name||'Staff'},updated_at=now() WHERE wa_id=${wa} AND reply_lock IS NULL RETURNING wa_id,staff_owner_id),
      drained AS (UPDATE public.dbk36_wa_messages m SET status='done',updated_at=now() FROM changed WHERE m.wa_id=changed.wa_id AND m.direction='in' AND m.status='pending' RETURNING m.id)
      INSERT INTO public.dbk159_wa_assignment_audit(wa_id,actor_id,action,owner_id) SELECT wa_id,${id},'assign',staff_owner_id FROM changed RETURNING id`;
    return rows.length?out({ok:true}):out({error:'BUSY_OR_NOT_FOUND'},409);
  }
  if(body.action==='resume'){
    const rows=await sql`WITH changed AS (UPDATE public.dbk36_wa_conversations SET mode='bot',staff_owner_id=NULL,staff_owner_name=NULL,updated_at=now() WHERE wa_id=${wa} AND reply_lock IS NULL AND (${admin} OR staff_owner_id=${id}) RETURNING wa_id),
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
