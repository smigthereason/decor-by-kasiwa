// WhatsApp-specific rights never confer global Admin or inventory privileges.
export const whatsappRoles = ['ADMIN','MANAGER','STORE','STORE_STAFF'] as const;
export type WhatsAppAccess = { admin:boolean; queue:boolean; transfer:boolean; supervise:boolean };
export function whatsappAccess(role:string,status:string,permissions:readonly string[] = []):WhatsAppAccess|null {
  if(status!=='ACTIVE'||!whatsappRoles.some(r=>r===role))return null;
  const admin=role==='ADMIN';
  if(!admin&&!permissions.includes('WHATSAPP_SALES'))return null;
  const supervise=admin||permissions.includes('WHATSAPP_SUPERVISE');
  return {admin,supervise,queue:supervise||permissions.includes('WHATSAPP_QUEUE'),transfer:supervise||permissions.includes('WHATSAPP_TRANSFER')};
}
