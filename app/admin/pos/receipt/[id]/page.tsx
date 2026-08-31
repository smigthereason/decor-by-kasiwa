import PosReceiptPage from "@/components/backoffice/PosReceiptPage";

export default async function AdminPosReceiptRoute({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <PosReceiptPage orderId={decodeURIComponent(id)} basePath="/admin" />;
}
