import ProductCreatePage from "@/components/backoffice/ProductCreatePage";

type PageProps = { params: Promise<{ id: string }> };

export default async function AdminProductEditPage({ params }: PageProps) {
  const { id } = await params;
  return <ProductCreatePage productId={decodeURIComponent(id)} />;
}
