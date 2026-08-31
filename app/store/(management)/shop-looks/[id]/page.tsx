import ShopLookEditorPage from "@/components/backoffice/ShopLookEditorPage";

export default async function StoreShopLookDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <ShopLookEditorPage mode="store" lookId={decodeURIComponent(id)} />;
}
