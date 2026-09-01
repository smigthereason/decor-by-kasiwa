import PageIntro from "@/components/root/PageIntro";
import ShopGrid from "@/components/root/shop/ShopGrid";
import { getShopNavigation, getStoreProducts } from "@/sanity/lib/catalog";
import type { ShopNavigation } from "@/types/commerce";
import type { Metadata } from 'next';


export const metadata: Metadata = {
  title: "Shop Home Decor in Kenya",
  description: "Shop Decor by Kasiwa for curated home décor, artificial plants, mirrors, lighting and finishing pieces in Kenya.",
  alternates: { canonical: "/shop" },
  openGraph: {
    title: "Shop Home Decor in Kenya | Decor by Kasiwa",
    description: "Browse curated décor and home accessories from Decor by Kasiwa.",
    url: "/shop",
    type: "website",
  },
};
export const dynamic = "force-dynamic";

type ShopParams = { category?: string; collection?: string; space?: string; style?: string; price?: string; q?: string };
type ShopPageProps = { searchParams: Promise<ShopParams> };

const defaultIntro = {
  eyebrow: "The Kasiwa Collection",
  title: "Objects for considered living.",
  body: "Explore décor, greenery, lighting, home accessories and finishing pieces brought together for expressive everyday spaces.",
  meta: "Complete Collection",
  index: "00",
  image: "https://images.unsplash.com/photo-1556909211-36987daf7b4d?q=80&w=2370&auto=format&fit=crop",
  featureImage: "https://images.unsplash.com/photo-1600210491369-e753d80a41f3?auto=format&fit=crop&w=1000&q=90",
  featureLabel: "The Kasiwa Edit",
  featureTitle: "Pieces selected to bring character, warmth and detail into the home.",
};

function findLabel(params: ShopParams, navigation: ShopNavigation) {
  if (params.category) {
    for (const category of navigation.categories) {
      if (category.slug === params.category) {
        return { label: category.title, kind: "Category", imageUrl: category.imageUrl || undefined };
      }
      const child = category.children.find((item) => item.slug === params.category);
      if (child) {
        return {
          label: child.title,
          kind: category.title,
          imageUrl: child.imageUrl || category.imageUrl || undefined,
        };
      }
    }
  }
  if (params.collection) {
    const item = navigation.collections.find((entry) => entry.slug === params.collection);
    if (item) return { label: item.title, kind: "Collection" };
  }
  if (params.space) {
    const item = navigation.spaces.find((entry) => entry.slug === params.space);
    if (item) return { label: item.title, kind: "Shop by Space" };
  }
  if (params.style) {
    const item = navigation.styles.find((entry) => entry.slug === params.style);
    if (item) return { label: item.title, kind: "Shop by Style" };
  }
  return null;
}

export default async function ShopPage({ searchParams }: ShopPageProps) {
  const [params, products, navigation] = await Promise.all([searchParams, getStoreProducts(), getShopNavigation()]);
  const selected = findLabel(params, navigation);
  const intro = selected
    ? {
        ...defaultIntro,
        eyebrow: selected.kind,
        title: selected.label,
        body: `Explore the Decor by Kasiwa ${selected.label} edit, curated within the client-approved shop structure.`,
        meta: selected.label,
        image: selected.imageUrl || defaultIntro.image,
        featureLabel: selected.kind,
        featureTitle: `Discover ${selected.label.toLowerCase()} from the live Decor by Kasiwa catalogue.`,
      }
    : defaultIntro;

  return (
    <>
      <PageIntro {...intro} />
      <div id="shop-collection" className="bg-[var(--paper)] px-4 py-8 md:px-8 md:py-12"><ShopGrid products={products} navigation={navigation} /></div>
    </>
  );
}
