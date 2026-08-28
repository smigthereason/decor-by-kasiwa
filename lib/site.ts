export const SITE_NAME = "Decor by Kasiwa";
export const SITE_DESCRIPTION =
  "Shop curated home décor, artificial plants, lighting, mirrors and finishing pieces for beautiful Kenyan homes.";

export function getSiteUrl() {
  const configured = process.env.NEXT_PUBLIC_SITE_URL?.trim();
  if (configured) return configured.replace(/\/$/, "");
  return "https://decorbykasiwa.co.ke";
}
