import ShopLookEditorPage from "@/components/backoffice/ShopLookEditorPage";

export default async function AdminShopLookDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <ShopLookEditorPage mode="admin" lookId={decodeURIComponent(id)} />;
}
