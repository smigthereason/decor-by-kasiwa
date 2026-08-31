import type { Metadata } from "next";

import ShopLanding from "@/components/root/home/ShopLanding";
import { getFeaturedShopLook, getShopNavigation, getStoreProducts } from "@/sanity/lib/catalog";
import { getPublicSiteSettings } from "@/sanity/lib/siteSettings";
import { getSiteUrl, SITE_DESCRIPTION, SITE_NAME } from "@/lib/site";

export const dynamic = "force-dynamic";

export async function generateMetadata(): Promise<Metadata> {
  const settings = await getPublicSiteSettings();
  const title = settings.seoTitle?.trim() || "Affordable Home Decor in Kenya";
  const description = settings.seoDescription?.trim() || SITE_DESCRIPTION;

  return {
    title,
    description,
    alternates: { canonical: "/" },
    openGraph: {
      title: `${title} | ${SITE_NAME}`,
      description,
      url: "/",
      type: "website",
    },
  };
}

export default async function Home() {
  const [products, navigation, settings, featuredLook] = await Promise.all([
    getStoreProducts(),
    getShopNavigation(),
    getPublicSiteSettings(),
    getFeaturedShopLook(),
  ]);

  const siteUrl = getSiteUrl();
  const structuredData = {
    "@context": "https://schema.org",
    "@type": "WebSite",
    name: SITE_NAME,
    url: siteUrl,
    description: settings.seoDescription?.trim() || SITE_DESCRIPTION,
    potentialAction: {
      "@type": "SearchAction",
      target: `${siteUrl}/shop?q={search_term_string}`,
      "query-input": "required name=search_term_string",
    },
  };

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(structuredData) }}
      />
      <ShopLanding products={products} navigation={navigation} settings={settings} featuredLook={featuredLook} />
    </>
  );
}
