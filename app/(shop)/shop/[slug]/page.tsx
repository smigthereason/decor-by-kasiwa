import { notFound } from "next/navigation";
import ProductDetailClient from "@/components/root/shop/ProductDetailClient";
import { getRelatedStoreProducts, getStoreProductBySlug } from "@/sanity/lib/catalog";


export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const product = await getStoreProductBySlug(slug);
  if (!product) return { title: "Product" };
  return { title: product.name, description: product.description };
}

export default async function ProductPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const product = await getStoreProductBySlug(slug);
  if (!product) notFound();
  const relatedProducts = await getRelatedStoreProducts(product, 3);
  return <ProductDetailClient product={product} relatedProducts={relatedProducts} />;
}
