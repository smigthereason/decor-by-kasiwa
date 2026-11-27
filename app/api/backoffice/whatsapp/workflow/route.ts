import {NextRequest,NextResponse} from 'next/server';
import {getApiStaff} from '@/lib/auth/api-authorization';
import {getCustomerByDocumentId} from '@/lib/auth/sanity-users';
import {serverClient} from '@/sanity/lib/serverClient';
import {dbk136Enabled,dbk136ListWhatsappJobs,dbk136SyncWhatsappJobs,dbk136AssignWhatsapp,dbk136AdvanceWhatsapp,dbk136JobState} from '@/lib/db/dbk136-whatsapp-workflow';
import {WA_FULFILMENT_STORE,WA_STAGES,waFulfilmentAccess,canPackStage,type WaStage,type FulfilmentEmployee} from '@/lib/whatsapp/dbk170-fulfilment-access';
import {packingCatalogue} from '@/lib/whatsapp/dbk163-packing-catalogue';
import {packingLines} from '@/lib/whatsapp/dbk162-packing';
export const dynamic='force-dynamic';export const runtime='nodejs';export const maxDuration=30;
const out=(data:unknown,status=200)=>NextResponse.json(data,{status,headers:{'Cache-Control':'private, no-store','X-Content-Type-Options':'nosniff'}});
async function authorized(){
 const staff=await getApiStaff(['ADMIN','MANAGER','STORE','STORE_STAFF','PRODUCTION_STAFF','PACKAGING_STAFF','DELIVERY_STAFF']);
 if(!staff.ok)return null;
 const customer=await getCustomerByDocumentId(staff.customerId);
 if(!customer||customer.role!==staff.role)return null;
 const access=waFulfilmentAccess(customer);return access?{staff,access}:null;
}
export async function GET(req:NextRequest){try{
 const viewer=await authorized();if(!viewer)return out({message:'Access denied.'},403);
 if(req.nextUrl.searchParams.get('access')==='1')return out({allowed:true});
 const {staff,access}=viewer;
 const base={orders:[],onlineOrders:[],whatsappEnabled:dbk136Enabled(),onlineAssignmentsEnabled:false,storeLocations:[{_id:WA_FULFILMENT_STORE,name:'OTC Mall'}],viewer:{role:staff.role,customerId:staff.customerId,manager:access.manager,stages:access.stages,assignedStoreId:WA_FULFILMENT_STORE,storeLocked:true}};
 if(!dbk136Enabled())return out({...base,whatsappOrders:[],availableStaff:[],whatsappWarning:'WhatsApp fulfilment workflow is disabled. Contact an administrator.'});
 const source=await dbk136ListWhatsappJobs(WA_FULFILMENT_STORE);
 const scoped=source.filter(job=>job.storeLocationId===WA_FULFILMENT_STORE&&(access.manager||(job.assignedStaffId===staff.customerId&&access.stages.includes(job.stage))));
 const catalogue=await packingCatalogue(scoped.map(job=>job.cartSnapshot));
 const whatsappOrders=scoped.map(({cartSnapshot,...job})=>({...job,storeLocationName:'OTC Mall',packingItems:packingLines(cartSnapshot,catalogue)}));
 const employees=access.manager?await serverClient.fetch<Array<FulfilmentEmployee&{_id:string;name:string}>>(`*[_type=='customerUser' && !(_id in path('drafts.**')) && status=='ACTIVE' && assignedStore._ref==$store] | order(name asc){_id,name,role,status,permissions,"assignedStore":assignedStore->{_id}}`,{store:WA_FULFILMENT_STORE},{cache:'no-store'}):[];
 const availableStaff=employees.filter(e=>WA_STAGES.some(stage=>canPackStage(e,stage))).map(e=>({_id:e._id,name:e.name,role:e.role,permissions:e.permissions,assignedStoreId:WA_FULFILMENT_STORE}));
 return out({...base,whatsappOrders,availableStaff});
}catch{ return out({message:'WhatsApp fulfilment could not be loaded. No payment or stock has been changed.'},503);}}
export async function POST(req:NextRequest){try{
 const viewer=await authorized();if(!viewer)return out({message:'Access denied.'},403);
 if(req.headers.get('origin')!==req.nextUrl.origin||req.headers.get('content-type')?.split(';')[0].trim()!=='application/json')return out({message:'Invalid request origin.'},403);
 if(!dbk136Enabled())return out({message:'WhatsApp fulfilment workflow is disabled.'},409);
 const {staff,access}=viewer,raw=await req.text();if(raw.length>4000)return out({message:'Invalid request.'},400);
 const b=JSON.parse(raw);if(!b||typeof b!=='object'||Array.isArray(b))return out({message:'Invalid request.'},400);
 if(b.action==='sync'){
   if(!access.manager)return out({message:'Access denied.'},403);
   await dbk136SyncWhatsappJobs();return out({ok:true});
 }
 if(!['assign','advance'].includes(b.action)||typeof b.orderId!=='string'||!/^DBKWA[A-Z0-9]{7}$/.test(b.orderId)||!WA_STAGES.includes(b.stage))return out({message:'Invalid order or stage.'},400);
 const stage=b.stage as WaStage;
 const job=(await dbk136ListWhatsappJobs(WA_FULFILMENT_STORE)).find(j=>j.reference===b.orderId&&j.stage===stage&&j.storeLocationId===WA_FULFILMENT_STORE);
 if(!job)return out({message:'Order not available in this stage. Refresh the queue.'},409);
 if(b.action==='assign'){
   if(!access.manager)return out({message:'Access denied.'},403);
   if(typeof b.staffId!=='string'||!b.staffId||b.staffId.length>200)return out({message:'Invalid assignee.'},400);
   const target=await getCustomerByDocumentId(b.staffId);
   if(!target||!canPackStage(target,stage))return out({message:'Employee is not eligible for this store and stage.'},403);
   await dbk136AssignWhatsapp({reference:job.reference,stage,staffId:target._id,staffName:target.name||'Staff',actorId:staff.customerId});
   const after=await dbk136JobState(job.reference);if(after?.stage!==stage||after.assigned_staff_id!==target._id)return out({message:'Assignment not confirmed. Refresh before retrying.'},409);
 }else{
   if(!job.assignedStaffId||(!access.manager&&(job.assignedStaffId!==staff.customerId||!access.stages.includes(stage))))return out({message:'Access denied or stage unassigned.'},403);
   await dbk136AdvanceWhatsapp({reference:job.reference,stage,actorId:staff.customerId,manager:access.manager});
   const after=await dbk136JobState(job.reference);if(after?.stage!==(stage==='PRODUCTION'?'PACKAGING':stage==='PACKAGING'?'DELIVERY':'DONE'))return out({message:'Stage update not confirmed. Refresh before retrying.'},409);
 }
 return out({ok:true});
}catch{return out({message:'Workflow action not confirmed. Refresh the queue before retrying.'},409);}}
