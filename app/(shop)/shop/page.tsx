import PageIntro from "@/components/root/PageIntro";
import ShopGrid from "@/components/root/shop/ShopGrid";
import { Suspense } from "react";

export const metadata = {
  title: "Shop",
};

const collectionContent = {
  furniture: {
    eyebrow: "Furniture Collection",
    title: "Pieces that shape the room.",
    body: "Considered furniture selected for proportion, material and everyday use — from statement seating to tables and pieces that anchor a space.",
    meta: "Furniture Edit",
    index: "01",
    image: "https://images.unsplash.com/photo-1600210492486-724fe5c67fb0?auto=format&fit=crop&w=2200&q=95",
    featureImage: "https://images.unsplash.com/photo-1618221195710-dd6b41faaea6?auto=format&fit=crop&w=1000&q=90",
    featureLabel: "Featured Furniture",
    featureTitle: "Form, comfort and material brought together.",
  },

  lighting: {
    eyebrow: "Lighting Collection",
    title: "Light that changes the atmosphere.",
    body: "Sculptural and functional lighting designed to bring warmth, depth and character to every part of the home.",
    meta: "Lighting Edit",
    index: "02",
    image: "https://images.unsplash.com/photo-1600607687939-ce8a6c25118c?auto=format&fit=crop&w=2200&q=95",
    featureImage: "https://images.unsplash.com/photo-1540932239986-30128078f3c5?auto=format&fit=crop&w=1000&q=90",
    featureLabel: "Featured Lighting",
    featureTitle: "Lighting selected for warmth, form and atmosphere.",
  },

  textiles: {
    eyebrow: "Textiles Collection",
    title: "Texture makes a space feel lived in.",
    body: "Cushions, throws, rugs and soft furnishings chosen to introduce warmth, tactility and quiet layers throughout the home.",
    meta: "Textile Edit",
    index: "03",
    image: "https://images.unsplash.com/photo-1616486338812-3dadae4b4ace?auto=format&fit=crop&w=2200&q=95",
    featureImage: "https://images.unsplash.com/photo-1600566753086-00f18fb6b3ea?auto=format&fit=crop&w=1000&q=90",
    featureLabel: "Featured Textiles",
    featureTitle: "Soft layers designed to bring warmth into the room.",
  },

  decor: {
    eyebrow: "Décor Collection",
    title: "The details that make it yours.",
    body: "Objects, vessels and finishing pieces selected to add character, personality and considered detail to everyday spaces.",
    meta: "Décor Edit",
    index: "04",
    image: "https://images.unsplash.com/photo-1600566753051-f0b89df2dd90?auto=format&fit=crop&w=2200&q=95",
    featureImage: "https://images.unsplash.com/photo-1618220179428-22790b461013?auto=format&fit=crop&w=1000&q=90",
    featureLabel: "Featured Objects",
    featureTitle: "The finishing pieces that give a space its character.",
  },

  all: {
    eyebrow: "The Kasiwa Collection",
    title: "Objects for considered living.",
    body: "Explore furniture, lighting, textiles and décor brought together as one complete interior language.",
    meta: "Complete Collection",
    index: "00",
    image: "https://images.unsplash.com/photo-1600585154340-be6161a56a0c?auto=format&fit=crop&w=2200&q=95",
    featureImage: "https://images.unsplash.com/photo-1600210491369-e753d80a41f3?auto=format&fit=crop&w=1000&q=90",
    featureLabel: "The Kasiwa Edit",
    featureTitle: "Furniture, lighting and objects selected as one complete language.",
  },
};

type CollectionKey = keyof typeof collectionContent;

type ShopPageProps = {
  searchParams: Promise<{
    category?: string;
  }>;
};

function normalizeCategory(value?: string): CollectionKey {
  if (!value) {
    return "all";
  }

  const category = value.trim().toLowerCase().replace("décor", "decor");

  if (
    category === "furniture" ||
    category === "lighting" ||
    category === "textiles" ||
    category === "decor"
  ) {
    return category;
  }

  return "all";
}

export default async function ShopPage({ searchParams }: ShopPageProps) {
  const params = await searchParams;

  const category = normalizeCategory(params.category);

  const intro = collectionContent[category];

  return (
    <>
      <PageIntro
        eyebrow={intro.eyebrow}
        title={intro.title}
        body={intro.body}
        meta={intro.meta}
        index={intro.index}
        image={intro.image}
        featureImage={intro.featureImage}
        featureLabel={intro.featureLabel}
        featureTitle={intro.featureTitle}
      />

      <div id="shop-collection" className="bg-[var(--paper)] px-4 py-8 md:px-8 md:py-12">
        <Suspense
          fallback={
            <div className="grid min-h-80 w-full place-items-center bg-[var(--paper)] text-[9px] uppercase tracking-[0.12em] text-[var(--muted)]">
              Loading collection…
            </div>
          }
        >
          <ShopGrid />
        </Suspense>
      </div>
    </>
  );
}
