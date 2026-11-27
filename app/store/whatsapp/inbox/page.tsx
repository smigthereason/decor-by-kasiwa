import WhatsAppInbox from '@/components/backoffice/WhatsAppInbox';
import {requireStaffAccess} from '@/lib/auth/authorization';
import {redirect} from 'next/navigation';
import {whatsappAccess} from '@/lib/whatsapp/dbk169-access';
export default async function Page(){const {customer}=await requireStaffAccess('STORE','/store/whatsapp/inbox');if(!whatsappAccess(customer.role,customer.status,customer.permissions))redirect('/account/access-denied?reason=role');return <WhatsAppInbox/>;}
