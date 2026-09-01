import type { Metadata } from "next";
import { notFound } from "next/navigation";

import ProductDetailClient from "@/components/root/shop/ProductDetailClient";
import { isProductSoldOut } from "@/lib/catalogue";
import { getSiteUrl, SITE_NAME } from "@/lib/site";
import { getRelatedStoreProducts, getStoreProductBySlug } from "@/sanity/lib/catalog";

export const dynamic = "force-dynamic";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const product = await getStoreProductBySlug(slug);

  if (!product) {
    return {
      title: "Product",
      robots: { index: false, follow: false },
    };
  }

  const title = `${product.name} – KES ${product.price.toLocaleString("en-KE")}`;

  return {
    title,
    description: product.description,
    alternates: { canonical: `/shop/${product.slug}` },
    openGraph: {
      type: "website",
      title: `${product.name} | ${SITE_NAME}`,
      description: product.description,
      url: `/shop/${product.slug}`,
      images: product.heroImage
        ? [{ url: product.heroImage, alt: product.name }]
        : undefined,
    },
    twitter: {
      card: "summary_large_image",
      title: `${product.name} | ${SITE_NAME}`,
      description: product.description,
      images: product.heroImage ? [product.heroImage] : undefined,
    },
  };
}

export default async function ProductPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const product = await getStoreProductBySlug(slug);

  if (!product) notFound();

  const [relatedProducts] = await Promise.all([
    getRelatedStoreProducts(product, 4),
  ]);
  const siteUrl = getSiteUrl();

  const structuredData = {
    "@context": "https://schema.org",
    "@type": "Product",
    name: product.name,
    description: product.description,
    sku: product.sku,
    image: product.images.length ? product.images : product.heroImage ? [product.heroImage] : undefined,
    brand: {
      "@type": "Brand",
      name: SITE_NAME,
    },
    offers: {
      "@type": "Offer",
      url: `${siteUrl}/shop/${product.slug}`,
      priceCurrency: "KES",
      price: product.price,
      availability: isProductSoldOut(product)
        ? "https://schema.org/OutOfStock"
        : "https://schema.org/InStock",
    },
  };

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(structuredData) }}
      />
      <ProductDetailClient product={product} relatedProducts={relatedProducts} />
    </>
  );
}
