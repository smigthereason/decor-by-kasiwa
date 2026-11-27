import FulfilmentWorkflowPage from '@/components/backoffice/FulfilmentWorkflowPage';
import {requireStaffAccess} from '@/lib/auth/authorization';
export default async function Page(){await requireStaffAccess('ADMIN','/admin/whatsapp/fulfillment');return <><div className="px-5 pt-4 text-sm"><a className="underline" href="/admin/whatsapp/paid-intake/fulfillment">Exceptional stock review and reconciliation (Admin only)</a></div><FulfilmentWorkflowPage whatsappOnly/></>;}
