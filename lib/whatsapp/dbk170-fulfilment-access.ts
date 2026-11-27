import {whatsappAccess} from './dbk169-access';
export const WA_FULFILMENT_STORE='storeLocation.4fcbd28b74494e7da7176525e63d73f4';
export const WA_STAGES=['PRODUCTION','PACKAGING','DELIVERY'] as const;
export type WaStage=typeof WA_STAGES[number];
export type FulfilmentEmployee={role:string;status:string;permissions?:readonly string[];assignedStore?:{_id?:string}|null};
export function waFulfilmentAccess(employee:FulfilmentEmployee){
  if(employee.status!=='ACTIVE')return null;
  const admin=employee.role==='ADMIN';
  if(!admin&&employee.assignedStore?._id!==WA_FULFILMENT_STORE)return null;
  const manager=admin||(['MANAGER','STORE'].includes(employee.role)&&whatsappAccess(employee.role,employee.status,employee.permissions)?.supervise===true);
  const stages=WA_STAGES.filter(stage=>employee.role===`${stage}_STAFF`||(['STORE_STAFF','MANAGER','STORE','PRODUCTION_STAFF','PACKAGING_STAFF','DELIVERY_STAFF'].includes(employee.role)&&employee.permissions?.includes(stage)));
  return manager||stages.length?{manager,stages:manager?[...WA_STAGES]:stages}:null;
}
export function canPackStage(employee:FulfilmentEmployee,stage:WaStage){
  return employee.status==='ACTIVE'&&employee.assignedStore?._id===WA_FULFILMENT_STORE&&
    (employee.role===`${stage}_STAFF`||(['STORE_STAFF','MANAGER','STORE','PRODUCTION_STAFF','PACKAGING_STAFF','DELIVERY_STAFF'].includes(employee.role)&&employee.permissions?.includes(stage)===true));
}
