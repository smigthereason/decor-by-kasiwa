import type { MetadataRoute } from "next";

import { getSiteUrl } from "@/lib/site";
import { getShopLooks, getStoreProducts } from "@/sanity/lib/catalog";

// Next.js serves this metadata route at /sitemap.xml for Google Search Console.
export const dynamic = "force-dynamic";

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const siteUrl = getSiteUrl().replace(/\/$/, "");
  const generatedAt = new Date();
  const staticRoutes = [
    "",
    "/shop",
    "/shop-by-look",
    "/about",
    "/services",
    "/portfolio",
    "/consultation",
    "/delivery",
    "/returns",
    "/faq",
    "/contact",
  ];

  let productRoutes: MetadataRoute.Sitemap = [];
  let lookRoutes: MetadataRoute.Sitemap = [];

  try {
    const [products, looks] = await Promise.all([getStoreProducts(), getShopLooks()]);
    productRoutes = products
      .filter((product) => product.available !== false && Boolean(product.slug))
      .map((product) => ({
        url: `${siteUrl}/shop/${product.slug}`,
        changeFrequency: "weekly" as const,
        priority: 0.8,
        lastModified: generatedAt,
      }));

    lookRoutes = looks.map((look) => ({
      url: `${siteUrl}/shop-by-look/${look.slug}`,
      changeFrequency: "weekly" as const,
      priority: 0.8,
      lastModified: generatedAt,
    }));
  } catch (error) {
    console.warn("Sitemap product fetch failed; serving static URLs only.", error);
  }

  return [
    ...staticRoutes.map((route, index) => ({
      url: `${siteUrl}${route}`,
      changeFrequency: index === 0 ? ("daily" as const) : ("weekly" as const),
      priority: index === 0 ? 1 : route === "/shop" ? 0.95 : 0.6,
      lastModified: generatedAt,
    })),
    ...productRoutes,
    ...lookRoutes,
  ];
}
