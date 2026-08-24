import type { StoreProduct } from "@/types/commerce";

// Sample catalogue data for the front-end journey prototype.
// Replace pricing, stock, copy and imagery with Sanity-managed client data before launch.
export const storeProducts: StoreProduct[] = [
  {
    id: "lamp-sculptural-01",
    slug: "sculptural-table-lamp",
    name: "Sculptural Table Lamp",
    category: "Lighting",
    price: 18500,
    currency: "KES",
    demoPrice: true,
    description:
      "A softly sculpted table lamp designed to add warm, focused light to bedside tables, consoles and reading corners.",
    story:
      "Quietly expressive rather than decorative for decoration's sake, this piece is intended to sit comfortably within layered, contemporary interiors.",
    materials: ["Textured ceramic", "Linen-look shade", "Metal fittings"],
    dimensions: "Approx. W 32 × D 32 × H 54 cm",
    care: "Dust with a soft dry cloth. Keep away from excessive moisture.",
    stock: "In stock",
    colours: ["Warm Ivory", "Charcoal"],
    heroImage:
      "https://images.unsplash.com/photo-1507473885765-e6ed057f782c?auto=format&fit=crop&w=1200&q=88",
    images: [
      "https://images.unsplash.com/photo-1507473885765-e6ed057f782c?auto=format&fit=crop&w=1200&q=88",
      "https://images.unsplash.com/photo-1540932239986-30128078f3c5?auto=format&fit=crop&w=1200&q=88",
      "https://images.unsplash.com/photo-1513506003901-1e6a229e2d15?auto=format&fit=crop&w=1200&q=88",
      "https://images.unsplash.com/photo-1532592068623-db1978e40df5?auto=format&fit=crop&w=1200&q=88",
    ],
    related: ["textured-lounge-chair", "statement-mirror", "soft-furnishing-edit"],
  },
  {
    id: "chair-textured-01",
    slug: "textured-lounge-chair",
    name: "Textured Lounge Chair",
    category: "Furniture",
    price: 68000,
    currency: "KES",
    demoPrice: true,
    description:
      "A grounded accent chair with a generous silhouette, tactile upholstery and a profile designed for relaxed living spaces.",
    story:
      "Use it as a visual anchor in a reading corner or pair it with lower, softer forms for a balanced living room composition.",
    materials: ["Textured upholstery", "Solid timber frame", "High-density foam"],
    dimensions: "Approx. W 78 × D 84 × H 76 cm",
    care: "Vacuum with an upholstery attachment and spot-clean only.",
    stock: "Made to order",
    colours: ["Sand", "Olive", "Charcoal"],
    heroImage:
      "https://images.unsplash.com/photo-1567538096630-e0c55bd6374c?auto=format&fit=crop&w=1200&q=88",
    images: [
      "https://images.unsplash.com/photo-1567538096630-e0c55bd6374c?auto=format&fit=crop&w=1200&q=88",
      "https://images.unsplash.com/photo-1598300042247-d088f8ab3a91?auto=format&fit=crop&w=1200&q=88",
      "https://images.unsplash.com/photo-1586023492125-27b2c045efd7?auto=format&fit=crop&w=1200&q=88",
      "https://images.unsplash.com/photo-1540574163026-643ea20ade25?auto=format&fit=crop&w=1200&q=88",
    ],
    related: ["sculptural-table-lamp", "statement-mirror", "ribbed-floor-lamp"],
  },
  {
    id: "mirror-statement-01",
    slug: "statement-mirror",
    name: "Statement Mirror",
    category: "Decor",
    price: 32000,
    currency: "KES",
    demoPrice: true,
    description:
      "An oversized mirror designed to bounce light, add depth and create a strong architectural moment within the room.",
    story:
      "Placed opposite a window or used above a console, the mirror becomes part of the spatial composition rather than a standalone accessory.",
    materials: ["Mirror glass", "Powder-coated metal frame"],
    dimensions: "Approx. W 90 × D 4 × H 180 cm",
    care: "Clean glass with a lint-free cloth. Avoid abrasive frame cleaners.",
    stock: "Low stock",
    colours: ["Black", "Brushed Brass"],
    heroImage:
      "https://images.unsplash.com/photo-1618220179428-22790b461013?auto=format&fit=crop&w=1200&q=88",
    images: [
      "https://images.unsplash.com/photo-1618220179428-22790b461013?auto=format&fit=crop&w=1200&q=88",
      "https://images.unsplash.com/photo-1615874694520-474822394e73?auto=format&fit=crop&w=1200&q=88",
      "https://images.unsplash.com/photo-1616486338812-3dadae4b4ace?auto=format&fit=crop&w=1200&q=88",
      "https://images.unsplash.com/photo-1615529182904-14819c35db37?auto=format&fit=crop&w=1200&q=88",
    ],
    related: ["textured-lounge-chair", "soft-furnishing-edit", "linen-accent-chair"],
  },
  {
    id: "textile-soft-01",
    slug: "soft-furnishing-edit",
    name: "Soft Furnishing Edit",
    category: "Textiles",
    price: 12500,
    currency: "KES",
    demoPrice: true,
    description:
      "A coordinated textile edit for layering sofas, occasional chairs and beds with warmth, texture and tonal variation.",
    story:
      "The set is intentionally quiet enough to work with stronger art, furniture and lighting while still giving the room a finished feel.",
    materials: ["Cotton blend", "Woven textured fabric", "Feather-look inserts"],
    dimensions: "Mixed cushion and throw sizes",
    care: "Follow individual care labels. Air regularly and spot-clean when required.",
    stock: "In stock",
    colours: ["Ivory", "Taupe", "Deep Brown"],
    heroImage:
      "https://images.unsplash.com/photo-1586023492125-27b2c045efd7?auto=format&fit=crop&w=1200&q=88",
    images: [
      "https://images.unsplash.com/photo-1586023492125-27b2c045efd7?auto=format&fit=crop&w=1200&q=88",
      "https://images.unsplash.com/photo-1616486338812-3dadae4b4ace?auto=format&fit=crop&w=1200&q=88",
      "https://images.unsplash.com/photo-1618221195710-dd6b41faaea6?auto=format&fit=crop&w=1200&q=88",
      "https://images.unsplash.com/photo-1600210492486-724fe5c67fb0?auto=format&fit=crop&w=1200&q=88",
    ],
    related: ["textured-lounge-chair", "sculptural-table-lamp", "statement-mirror"],
  },
  {
    id: "lamp-floor-01",
    slug: "ribbed-floor-lamp",
    name: "Ribbed Floor Lamp",
    category: "Lighting",
    price: 27500,
    currency: "KES",
    demoPrice: true,
    description:
      "A tall ambient floor lamp with a slim footprint for softer evening light beside sofas, lounge chairs or reading areas.",
    story:
      "The restrained profile keeps the room visually open while adding a warm vertical layer to the lighting scheme.",
    materials: ["Metal base", "Textured shade", "Braided cable"],
    dimensions: "Approx. W 38 × D 38 × H 158 cm",
    care: "Dust the shade gently and wipe the base with a dry cloth.",
    stock: "In stock",
    colours: ["Black", "Warm Brass"],
    heroImage:
      "https://images.unsplash.com/photo-1507473885765-e6ed057f782c?auto=format&fit=crop&w=1200&q=88",
    images: [
      "https://images.unsplash.com/photo-1507473885765-e6ed057f782c?auto=format&fit=crop&w=1200&q=88",
      "https://images.unsplash.com/photo-1513506003901-1e6a229e2d15?auto=format&fit=crop&w=1200&q=88",
      "https://images.unsplash.com/photo-1540932239986-30128078f3c5?auto=format&fit=crop&w=1200&q=88",
    ],
    related: ["textured-lounge-chair", "statement-mirror", "linen-accent-chair"],
  },
  {
    id: "chair-linen-01",
    slug: "linen-accent-chair",
    name: "Linen Accent Chair",
    category: "Furniture",
    price: 52000,
    currency: "KES",
    demoPrice: true,
    description:
      "A compact occasional chair combining softened lines with a natural linen-look finish for bedrooms, living spaces and entry areas.",
    story:
      "Its smaller scale makes it useful where a full lounge chair would feel too heavy, while still offering a composed, premium silhouette.",
    materials: ["Linen-look fabric", "Timber frame", "Foam cushioning"],
    dimensions: "Approx. W 68 × D 72 × H 78 cm",
    care: "Vacuum gently and spot-clean with a colour-safe upholstery cleaner.",
    stock: "Made to order",
    colours: ["Natural", "Olive"],
    heroImage:
      "https://images.unsplash.com/photo-1598300042247-d088f8ab3a91?auto=format&fit=crop&w=1200&q=88",
    images: [
      "https://images.unsplash.com/photo-1598300042247-d088f8ab3a91?auto=format&fit=crop&w=1200&q=88",
      "https://images.unsplash.com/photo-1567538096630-e0c55bd6374c?auto=format&fit=crop&w=1200&q=88",
      "https://images.unsplash.com/photo-1540574163026-643ea20ade25?auto=format&fit=crop&w=1200&q=88",
    ],
    related: ["ribbed-floor-lamp", "statement-mirror", "soft-furnishing-edit"],
  },
];

export function getProductBySlug(slug: string) {
  return storeProducts.find((product) => product.slug === slug);
}

export function getProductById(id: string) {
  return storeProducts.find((product) => product.id === id);
}

export function formatMoney(value: number, currency = "KES") {
  return new Intl.NumberFormat("en-KE", {
    style: "currency",
    currency,
    maximumFractionDigits: 0,
  }).format(value);
}
