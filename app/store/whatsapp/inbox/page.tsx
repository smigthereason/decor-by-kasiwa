import WhatsAppInbox from '@/components/backoffice/WhatsAppInbox';
import {requireStaffAccess} from '@/lib/auth/authorization';
import {redirect} from 'next/navigation';
export default async function Page(){const {customer}=await requireStaffAccess('STORE','/store/whatsapp/inbox');if(customer.role!=='ADMIN'&&(!['STORE','MANAGER','STORE_STAFF'].includes(customer.role)||!customer.permissions?.includes('WHATSAPP_SALES')))redirect('/account/access-denied?reason=role');return <WhatsAppInbox/>;}
