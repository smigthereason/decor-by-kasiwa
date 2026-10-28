import { client } from "./client";
import { optimizeSanityImageUrl } from "./optimizedImage";

export type PublicSiteSettings = {
  brandName?: string;
  tagline?: string;
  homeHeroEyebrow?: string;
  homeHeroTitle?: string;
  homeHeroBody?: string;
  homeHeroCtaLabel?: string;
  homeHeroImageUrl?: string;
  seoTitle?: string;
  seoDescription?: string;
};

export async function getPublicSiteSettings(): Promise<PublicSiteSettings> {
  if (!process.env.NEXT_PUBLIC_SANITY_PROJECT_ID) {
    return {};
  }

  try {
    const settings = await client.fetch<PublicSiteSettings | null>(
      `*[_type == "siteSettings" && _id == "siteSettings"][0]{
        brandName,
        tagline,
        homeHeroEyebrow,
        homeHeroTitle,
        homeHeroBody,
        homeHeroCtaLabel,
        "homeHeroImageUrl": homeHeroImage.asset->url,
        seoTitle,
        seoDescription
      }`,
      {},
      { next: { revalidate: 300 } },
    );

    if (!settings) return {};
    return {
      ...settings,
      homeHeroImageUrl: settings.homeHeroImageUrl
        ? optimizeSanityImageUrl(settings.homeHeroImageUrl, { width: 1600, quality: 72 })
        : undefined,
    };
  } catch (error) {
    console.warn("Site settings could not be loaded from Sanity.", error);
    return {};
  }
}
