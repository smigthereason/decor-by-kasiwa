import type { MetadataRoute } from "next";

import { getSiteUrl } from "@/lib/site";
import { getStoreProducts } from "@/sanity/lib/catalog";

export const dynamic = "force-dynamic";

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const siteUrl = getSiteUrl();
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

  try {
    const products = await getStoreProducts();
    productRoutes = products
      .filter((product) => product.available !== false && Boolean(product.slug))
      .map((product) => ({
        url: `${siteUrl}/shop/${product.slug}`,
        changeFrequency: "weekly" as const,
        priority: 0.8,
      }));
  } catch (error) {
    console.warn("Sitemap product fetch failed; serving static URLs only.", error);
  }

  return [
    ...staticRoutes.map((route, index) => ({
      url: `${siteUrl}${route}`,
      changeFrequency: index === 0 ? ("daily" as const) : ("weekly" as const),
      priority: index === 0 ? 1 : route === "/shop" ? 0.95 : 0.6,
    })),
    ...productRoutes,
  ];
}
