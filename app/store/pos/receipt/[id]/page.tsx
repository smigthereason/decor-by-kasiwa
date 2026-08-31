import PosReceiptPage from "@/components/backoffice/PosReceiptPage";

export default async function StorePosReceiptRoute({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <PosReceiptPage orderId={decodeURIComponent(id)} basePath="/store" />;
}
