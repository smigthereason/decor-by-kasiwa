import FulfilmentWorkflowPage from '@/components/backoffice/FulfilmentWorkflowPage';
import {requireStaffAccess} from '@/lib/auth/authorization';
import {waFulfilmentAccess} from '@/lib/whatsapp/dbk170-fulfilment-access';
import {redirect} from 'next/navigation';
export default async function Page(){const {customer}=await requireStaffAccess('STORE','/store/whatsapp/fulfillment');if(!waFulfilmentAccess(customer))redirect('/account/access-denied?reason=role');return <FulfilmentWorkflowPage whatsappOnly/>;}
