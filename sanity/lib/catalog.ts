import imageUrlBuilder from "@sanity/image-url";

import type {
  CatalogTag,
  ShopCategory,
  ShopNavigation,
  ShopLook,
  ShopLookProduct,
  StoreProduct,
} from "@/types/commerce";

import { client } from "./client";

const imageBuilder = imageUrlBuilder(client);

type ImageSource =
  Parameters<typeof imageBuilder.image>[0];

type SanityReferenceLabel = {
  _id?: string;
  title?: string;
  slug?: string;
  parent?: SanityReferenceLabel;
};

type SanityProductRecord = {
  _id: string;

  name?: string;
  slug?: string;
  sku?: string;

  price?: number;
  procurementCost?: number;
  ecommerceEnabled?: boolean;
  posEnabled?: boolean;
  rating?: number;
  reviewCount?: number;

  shortDescription?: string;
  description?: string;

  colours?: string[];
  variants?: Array<{
    _key?: string;
    title?: string;
    colour?: string;
    size?: string;
    sku?: string;
    price?: number;
    stockQuantity?: number;
    image?: ImageSource;
  }>;
  materials?: string[];

  dimensions?: string;
  careInstructions?: string;

  initialStock?: number;
  available?: boolean;

  featured?: boolean;
  newArrival?: boolean;
  bestSeller?: boolean;
  onSale?: boolean;

  heroImage?: ImageSource;
  gallery?: ImageSource[];

  primaryCategory?: SanityReferenceLabel;
  categories?: SanityReferenceLabel[];

  spaces?: SanityReferenceLabel[];
  styles?: SanityReferenceLabel[];
  collections?: SanityReferenceLabel[];
};

type SanityShopLookRecord = {
  _id: string;
  title?: string;
  slug?: string;
  eyebrow?: string;
  description?: string;
  heroImage?: ImageSource;
  space?: SanityReferenceLabel;
  style?: SanityReferenceLabel;
  featured?: boolean;
  active?: boolean;
  displayOrder?: number;
  seoTitle?: string;
  seoDescription?: string;
  products?: Array<{
    _key?: string;
    quantity?: number;
    note?: string;
    product?: SanityProductRecord | null;
  }>;
};

type SanityCategoryRecord = {
  _id: string;

  title?: string;
  slug?: string;

  description?: string;

  parentId?: string;

  /*
   * For navigation categories we retrieve
   * the final Sanity CDN URL directly in GROQ.
   */
  imageUrl?: string | null;
};

/* -------------------------------------------------------------------------- */
/* PRODUCT PROJECTION                                                         */
/* -------------------------------------------------------------------------- */

const productProjection = `{
  _id,
  name,
  "slug": slug.current,
  sku,
  price,
  procurementCost,
  ecommerceEnabled,
  posEnabled,
  rating,
  reviewCount,
  shortDescription,
  description,
  colours,
  variants[]{
    _key,
    title,
    colour,
    size,
    sku,
    price,
    stockQuantity,
    image
  },
  materials,
  dimensions,
  careInstructions,
  initialStock,
  available,
  featured,
  newArrival,
  bestSeller,
  onSale,
  heroImage,
  gallery,

  "primaryCategory": primaryCategory->{
    _id,
    title,
    "slug": slug.current,

    "parent": parent->{
      _id,
      title,
      "slug": slug.current
    }
  },

  "categories": categories[]->{
    _id,
    title,
    "slug": slug.current
  },

  "spaces": spaces[]->{
    _id,
    title,
    "slug": slug.current
  },

  "styles": styles[]->{
    _id,
    title,
    "slug": slug.current
  },

  "collections": collections[]->{
    _id,
    title,
    "slug": slug.current
  }
}`;

/* -------------------------------------------------------------------------- */
/* IMAGE HELPERS                                                              */
/* -------------------------------------------------------------------------- */

function toImageUrl(
  source?: ImageSource,
) {
  if (!source) {
    return "";
  }

  return imageBuilder
    .image(source)
    .width(1400)
    .quality(88)
    .auto("format")
    .url();
}

/* -------------------------------------------------------------------------- */
/* TAG HELPERS                                                                */
/* -------------------------------------------------------------------------- */

function tagFromReference(
  value?: SanityReferenceLabel,
): CatalogTag | null {
  if (
    !value?.title ||
    !value.slug
  ) {
    return null;
  }

  return {
    title: value.title,
    slug: value.slug,
  };
}

function tagsFromReferences(
  values?: SanityReferenceLabel[],
): CatalogTag[] {
  return (values || [])
    .map(tagFromReference)
    .filter(
      (
        item,
      ): item is CatalogTag =>
        Boolean(item),
    );
}

/* -------------------------------------------------------------------------- */
/* STOCK                                                                      */
/* -------------------------------------------------------------------------- */

function stockLabel(
  stock: number | undefined,
  available: boolean | undefined,
) {
  if (
    available === false
  ) {
    return "Unavailable";
  }

  if (
    typeof stock !== "number"
  ) {
    return "Availability on request";
  }

  if (stock <= 0) {
    return "Out of stock";
  }

  if (stock <= 5) {
    return "Low stock";
  }

  return "In stock";
}

/* -------------------------------------------------------------------------- */
/* PRODUCT MAPPER                                                             */
/* -------------------------------------------------------------------------- */

function mapProduct(
  record: SanityProductRecord,
): StoreProduct {
  const heroImage =
    toImageUrl(
      record.heroImage,
    );

  const gallery =
    (
      record.gallery ||
      []
    )
      .map(toImageUrl)
      .filter(Boolean);

  const images =
    Array.from(
      new Set(
        [
          heroImage,
          ...gallery,
        ].filter(Boolean),
      ),
    );

  const description =
    record.shortDescription?.trim() ||
    record.description?.trim() ||
    "Product details are being prepared. Contact Decor by Kasiwa for more information about this piece.";

  return {
    id: record._id,

    slug:
      record.slug ||
      record._id,

    sku:
      record.sku,

    name:
      record.name ||
      "Untitled product",

    category:
      record.primaryCategory
        ?.title ||
      "Uncategorised",

    categorySlug:
      record.primaryCategory
        ?.slug,

    categoryId:
      record.primaryCategory
        ?._id,

    categoryParent:
      tagFromReference(
        record.primaryCategory
          ?.parent,
      ) || undefined,

    price:
      typeof record.price ===
      "number"
        ? record.price
        : 0,

    currency:
      "KES",

    ecommerceEnabled: record.ecommerceEnabled !== false,
    posEnabled: record.posEnabled !== false,

    rating:
      typeof record.rating === "number"
        ? record.rating
        : undefined,

    reviewCount:
      typeof record.reviewCount === "number"
        ? record.reviewCount
        : undefined,

    description,

    story:
      record.description?.trim() ||
      description,

    materials:
      record.materials ||
      [],

    dimensions:
      record.dimensions?.trim() ||
      "Dimensions available on request.",

    care:
      record.careInstructions?.trim() ||
      "Care guidance available on request.",

    stock:
      stockLabel(
        record.initialStock,
        record.available,
      ),

    stockQuantity:
      typeof record.initialStock ===
      "number"
        ? record.initialStock
        : null,

    colours:
      record.colours ||
      [],

    variants: (record.variants || []).map((variant, index) => ({
      id: variant._key || `${record._id}-variant-${index}`,
      title: variant.title?.trim() || undefined,
      colour: variant.colour?.trim() || undefined,
      size: variant.size?.trim() || undefined,
      sku: variant.sku?.trim() || undefined,
      price: typeof variant.price === "number" ? variant.price : undefined,
      stockQuantity: typeof variant.stockQuantity === "number" ? variant.stockQuantity : null,
      imageUrl: variant.image ? toImageUrl(variant.image) : undefined,
    })),

    heroImage,

    images,

    related: [],

    categories:
      tagsFromReferences(
        record.categories,
      ),

    spaces:
      tagsFromReferences(
        record.spaces,
      ),

    styles:
      tagsFromReferences(
        record.styles,
      ),

    collections:
      tagsFromReferences(
        record.collections,
      ),

    featured:
      record.featured,

    newArrival:
      record.newArrival,

    bestSeller:
      record.bestSeller,

    onSale:
      record.onSale,

    available:
      record.available !==
      false,
  };
}

/* -------------------------------------------------------------------------- */
/* SHOP BY LOOK                                                               */
/* -------------------------------------------------------------------------- */

const shopLookProjection = `{
  _id,
  title,
  "slug": slug.current,
  eyebrow,
  description,
  heroImage,
  "space": space->{_id, title, "slug": slug.current},
  "style": style->{_id, title, "slug": slug.current},
  featured,
  active,
  displayOrder,
  seoTitle,
  seoDescription,
  products[]{
    _key,
    quantity,
    note,
    "product": product->${productProjection}
  }
}`;

function mapShopLook(record: SanityShopLookRecord): ShopLook {
  const products: ShopLookProduct[] = (record.products || [])
    .filter(
      (line): line is NonNullable<typeof line> & { product: SanityProductRecord } =>
        Boolean(
          line?.product?._id &&
            line.product.available !== false &&
            line.product.ecommerceEnabled !== false &&
            typeof line.product.price === "number" &&
            line.product.price > 0,
        ),
    )
    .map((line, index) => ({
      id: line._key || `${record._id}-product-${index}`,
      quantity:
        typeof line.quantity === "number" && line.quantity > 0
          ? Math.floor(line.quantity)
          : 1,
      note: line.note?.trim() || undefined,
      product: mapProduct(line.product),
    }));

  const firstProductImage = products.find((line) => line.product.heroImage)?.product.heroImage;
  const totalPrice = products.reduce(
    (sum, line) => sum + line.product.price * line.quantity,
    0,
  );
  const totalUnits = products.reduce((sum, line) => sum + line.quantity, 0);

  return {
    id: record._id,
    title: record.title?.trim() || "Untitled look",
    slug: record.slug || record._id,
    eyebrow: record.eyebrow?.trim() || undefined,
    description:
      record.description?.trim() ||
      "A curated Decor by Kasiwa room edit combining complementary pieces.",
    heroImageUrl: toImageUrl(record.heroImage) || firstProductImage || undefined,
    space: tagFromReference(record.space) || undefined,
    style: tagFromReference(record.style) || undefined,
    products,
    featured: record.featured,
    active: record.active !== false,
    displayOrder: record.displayOrder,
    seoTitle: record.seoTitle?.trim() || undefined,
    seoDescription: record.seoDescription?.trim() || undefined,
    totalPrice,
    totalUnits,
  };
}

export async function getShopLooks(): Promise<ShopLook[]> {
  if (!process.env.NEXT_PUBLIC_SANITY_PROJECT_ID) return [];

  const records = await client.fetch<SanityShopLookRecord[]>(
    `*[
      _type == "shopLook" &&
      defined(slug.current) &&
      active != false
    ] | order(featured desc, displayOrder asc, title asc) ${shopLookProjection}`,
  );

  return records.map(mapShopLook).filter((look) => look.products.length > 0);
}

export async function getFeaturedShopLook(): Promise<ShopLook | null> {
  const looks = await getShopLooks();
  return looks.find((look) => look.featured) || looks[0] || null;
}

export async function getShopLookBySlug(slug: string): Promise<ShopLook | null> {
  if (!process.env.NEXT_PUBLIC_SANITY_PROJECT_ID) return null;

  const record = await client.fetch<SanityShopLookRecord | null>(
    `*[
      _type == "shopLook" &&
      slug.current == $slug &&
      active != false
    ][0] ${shopLookProjection}`,
    { slug },
  );

  if (!record) return null;
  const look = mapShopLook(record);
  return look.products.length > 0 ? look : null;
}

/* -------------------------------------------------------------------------- */
/* FALLBACK SHOP NAVIGATION                                                   */
/* -------------------------------------------------------------------------- */

export const fallbackShopNavigation: ShopNavigation =
  {
    categories: [
      {
        id:
          "plants-and-greenery",

        title:
          "Plants & Greenery",

        slug:
          "plants-and-greenery",

        children: [
          {
            title:
              "Artificial Plants",
            slug:
              "artificial-plants",
          },

          {
            title:
              "Artificial Trees",
            slug:
              "artificial-trees",
          },

          {
            title:
              "Hanging Plants",
            slug:
              "hanging-plants",
          },

          {
            title:
              "Pampas Grass",
            slug:
              "pampas-grass",
          },
        ],
      },

      {
        id:
          "vases-and-planters",

        title:
          "Vases & Planters",

        slug:
          "vases-and-planters",

        children: [
          {
            title:
              "Decorative Vases",
            slug:
              "decorative-vases",
          },

          {
            title:
              "Ceramic Vases",
            slug:
              "ceramic-vases",
          },

          {
            title:
              "Glass Vases",
            slug:
              "glass-vases",
          },

          {
            title:
              "Planters",
            slug:
              "planters",
          },
        ],
      },

      {
        id:
          "flowers-and-floral-decor",

        title:
          "Flowers & Floral Decor",

        slug:
          "flowers-and-floral-decor",

        children: [
          {
            title:
              "Artificial Flowers",
            slug:
              "artificial-flowers",
          },

          {
            title:
              "Flower Bunches",
            slug:
              "flower-bunches",
          },

          {
            title:
              "Flower Stems",
            slug:
              "flower-stems",
          },

          {
            title:
              "Roses",
            slug:
              "roses",
          },

          {
            title:
              "Tulips",
            slug:
              "tulips",
          },

          {
            title:
              "Floral Accessories",
            slug:
              "floral-accessories",
          },
        ],
      },

      {
        id:
          "candles-and-fragrance",

        title:
          "Candles & Fragrance",

        slug:
          "candles-and-fragrance",

        children: [
          {
            title:
              "Candles",
            slug:
              "candles",
          },

          {
            title:
              "Candle Holders",
            slug:
              "candle-holders",
          },

          {
            title:
              "Diffusers",
            slug:
              "diffusers",
          },

          {
            title:
              "Aroma Diffusers",
            slug:
              "aroma-diffusers",
          },

          {
            title:
              "Essential Oils",
            slug:
              "essential-oils",
          },
        ],
      },

      {
        id:
          "lighting",

        title:
          "Lighting",

        slug:
          "lighting",

        children: [
          {
            title:
              "Decorative Lamps",
            slug:
              "decorative-lamps",
          },

          {
            title:
              "Fairy Lights",
            slug:
              "fairy-lights",
          },

          {
            title:
              "LED Lights",
            slug:
              "led-lights",
          },

          {
            title:
              "Rattan Lights",
            slug:
              "rattan-lights",
          },
        ],
      },

      {
        id:
          "wall-decor",

        title:
          "Wall Decor",

        slug:
          "wall-decor",

        children: [
          {
            title:
              "Mirrors",
            slug:
              "mirrors",
          },

          {
            title:
              "Wall Art",
            slug:
              "wall-art",
          },

          {
            title:
              "Wall Hangings",
            slug:
              "wall-hangings",
          },

          {
            title:
              "Wall Shelves",
            slug:
              "wall-shelves",
          },
        ],
      },

      {
        id:
          "furniture-and-stands",

        title:
          "Furniture & Stands",

        slug:
          "furniture-and-stands",

        children: [
          {
            title:
              "Coffee Tables",
            slug:
              "coffee-tables",
          },

          {
            title:
              "Plant Stands",
            slug:
              "plant-stands",
          },

          {
            title:
              "Decorative Stands",
            slug:
              "decorative-stands",
          },

          {
            title:
              "Shelving",
            slug:
              "shelving",
          },
        ],
      },

      {
        id:
          "home-accessories",

        title:
          "Home Accessories",

        slug:
          "home-accessories",

        children: [
          {
            title:
              "Cushions",
            slug:
              "cushions",
          },

          {
            title:
              "Baskets",
            slug:
              "baskets",
          },

          {
            title:
              "Trays",
            slug:
              "trays",
          },

          {
            title:
              "Table Decor",
            slug:
              "table-decor",
          },
        ],
      },

      {
        id:
          "gifts-and-packaging",

        title:
          "Gifts & Packaging",

        slug:
          "gifts-and-packaging",

        children: [
          {
            title:
              "Gift Boxes",
            slug:
              "gift-boxes",
          },

          {
            title:
              "Gift Bags",
            slug:
              "gift-bags",
          },

          {
            title:
              "Gift Wrapping",
            slug:
              "gift-wrapping",
          },

          {
            title:
              "Gift Accessories",
            slug:
              "gift-accessories",
          },
        ],
      },

      {
        id:
          "bathroom-and-kitchen",

        title:
          "Bathroom & Kitchen",

        slug:
          "bathroom-and-kitchen",

        children: [
          {
            title:
              "Bathroom Accessories",
            slug:
              "bathroom-accessories",
          },

          {
            title:
              "Bathroom Sets",
            slug:
              "bathroom-sets",
          },

          {
            title:
              "Kitchen Accessories",
            slug:
              "kitchen-accessories",
          },

          {
            title:
              "Kitchen Sets",
            slug:
              "kitchen-sets",
          },
        ],
      },

      {
        id:
          "diy-and-accessories",

        title:
          "DIY & Accessories",

        slug:
          "diy-and-accessories",

        children: [
          {
            title:
              "Hooks & Hangers",
            slug:
              "hooks-and-hangers",
          },

          {
            title:
              "Adhesives",
            slug:
              "adhesives",
          },

          {
            title:
              "Craft Supplies",
            slug:
              "craft-supplies",
          },

          {
            title:
              "Batteries & Small Accessories",
            slug:
              "batteries-and-small-accessories",
          },
        ],
      },
    ],

    spaces: [
      {
        title:
          "Living Room",
        slug:
          "living-room",
      },

      {
        title:
          "Bedroom",
        slug:
          "bedroom",
      },

      {
        title:
          "Dining",
        slug:
          "dining",
      },

      {
        title:
          "Bathroom",
        slug:
          "bathroom",
      },

      {
        title:
          "Office",
        slug:
          "office",
      },

      {
        title:
          "Balcony & Outdoor",
        slug:
          "balcony-and-outdoor",
      },

      {
        title:
          "Events & Gifting",
        slug:
          "events-and-gifting",
      },
    ],

    styles: [
      {
        title:
          "Modern",
        slug:
          "modern",
      },

      {
        title:
          "Minimalist",
        slug:
          "minimalist",
      },

      {
        title:
          "Boho",
        slug:
          "boho",
      },

      {
        title:
          "Natural",
        slug:
          "natural",
      },

      {
        title:
          "Elegant",
        slug:
          "elegant",
      },

      {
        title:
          "Statement Pieces",
        slug:
          "statement-pieces",
      },
    ],

    collections: [
      {
        title:
          "New Arrivals",
        slug:
          "new-arrivals",
      },

      {
        title:
          "Best Sellers",
        slug:
          "best-sellers",
      },

      {
        title:
          "Offers",
        slug:
          "offers",
      },

      {
        title:
          "Clearance",
        slug:
          "clearance",
      },
    ],
  };

/* -------------------------------------------------------------------------- */
/* PRODUCTS                                                                   */
/* -------------------------------------------------------------------------- */

export async function getStoreProducts(channel: "ecommerce" | "pos" = "ecommerce"): Promise<
  StoreProduct[]
> {
  if (
    !process.env
      .NEXT_PUBLIC_SANITY_PROJECT_ID
  ) {
    return [];
  }

  const records =
    await client.fetch<
      SanityProductRecord[]
    >(
      `*[
        _type == "product" &&
        defined(slug.current) &&
        defined(price) &&
        price > 0 &&
        available != false &&
        ${channel === "pos" ? "posEnabled != false" : "ecommerceEnabled != false"}
      ]
      | order(name asc)
      ${productProjection}`,
    );

  return records.map(
    mapProduct,
  );
}

export async function getStoreProductBySlug(
  slug: string,
): Promise<StoreProduct | null> {
  if (
    !process.env
      .NEXT_PUBLIC_SANITY_PROJECT_ID
  ) {
    return null;
  }

  const record =
    await client.fetch<
      SanityProductRecord | null
    >(
      `*[
        _type == "product" &&
        slug.current == $slug &&
        defined(price) &&
        price > 0 &&
        available != false &&
        ecommerceEnabled != false
      ][0]
      ${productProjection}`,

      {
        slug,
      },
    );

  return record
    ? mapProduct(record)
    : null;
}

export async function getRelatedStoreProducts(
  product: StoreProduct,
  limit = 3,
): Promise<StoreProduct[]> {
  if (
    !process.env
      .NEXT_PUBLIC_SANITY_PROJECT_ID
  ) {
    return [];
  }

  const records =
    product.categoryId
      ? await client.fetch<
          SanityProductRecord[]
        >(
          `*[
            _type == "product" &&
            _id != $id &&
            defined(price) &&
            price > 0 &&
            available != false &&
            ecommerceEnabled != false &&
            primaryCategory._ref == $categoryId
          ]
          | order(name asc)
          [0...10]
          ${productProjection}`,

          {
            id:
              product.id,

            categoryId:
              product.categoryId,
          },
        )
      : [];

  if (
    records.length >=
    limit
  ) {
    return records
      .slice(0, limit)
      .map(mapProduct);
  }

  const fallback =
    await client.fetch<
      SanityProductRecord[]
    >(
      `*[
        _type == "product" &&
        _id != $id &&
        defined(price) &&
        price > 0 &&
        available != false &&
        ecommerceEnabled != false
      ]
      | order(name asc)
      [0...10]
      ${productProjection}`,

      {
        id:
          product.id,
      },
    );

  const merged = [
    ...records,
    ...fallback,
  ].filter(
    (
      item,
      index,
      all,
    ) =>
      all.findIndex(
        (other) =>
          other._id ===
          item._id,
      ) === index,
  );

  return merged
    .slice(0, limit)
    .map(mapProduct);
}

/* -------------------------------------------------------------------------- */
/* SHOP NAVIGATION                                                            */
/* -------------------------------------------------------------------------- */

export async function getShopNavigation(): Promise<ShopNavigation> {
  if (
    !process.env
      .NEXT_PUBLIC_SANITY_PROJECT_ID
  ) {
    return fallbackShopNavigation;
  }

  try {
    const [
      categories,
      spaces,
      styles,
      collections,
    ] =
      await Promise.all([
        client.fetch<
          SanityCategoryRecord[]
        >(
          `*[
            _type == "category" &&
            active != false &&
            showInNavigation != false
          ]
          | order(
            displayOrder asc,
            title asc
          ) {
            _id,
            title,
            "slug": slug.current,
            description,
            "parentId": parent._ref,

            "imageUrl": coalesce(
              image.asset->url,
              categoryImage.asset->url,
              navigationImage.asset->url,
              heroImage.asset->url
            )
          }`,
        ),

        client.fetch<
          SanityReferenceLabel[]
        >(
          `*[
            _type == "shopSpace" &&
            active != false
          ]
          | order(
            displayOrder asc,
            title asc
          ) {
            _id,
            title,
            "slug": slug.current
          }`,
        ),

        client.fetch<
          SanityReferenceLabel[]
        >(
          `*[
            _type == "shopStyle" &&
            active != false
          ]
          | order(
            displayOrder asc,
            title asc
          ) {
            _id,
            title,
            "slug": slug.current
          }`,
        ),

        client.fetch<
          SanityReferenceLabel[]
        >(
          `*[
            _type == "collection" &&
            active != false
          ]
          | order(
            displayOrder asc,
            title asc
          ) {
            _id,
            title,
            "slug": slug.current
          }`,
        ),
      ]);

    const fallbackBySlug =
      new Map<
        string,
        ShopCategory
      >(
        fallbackShopNavigation
          .categories
          .map(
            (
              category,
            ) => [
              category.slug,
              category,
            ],
          ),
      );

    /*
     * Build all top-level categories
     * returned from Sanity.
     */
    const sanityTopLevel: ShopCategory[] =
      categories
        .filter(
          (
            category,
          ) =>
            !category.parentId &&
            Boolean(
              category.title,
            ) &&
            Boolean(
              category.slug,
            ),
        )
        .map(
          (
            category,
          ) => {
            const slug =
              category.slug!;

            const fallbackCategory =
              fallbackBySlug.get(
                slug,
              );

            /*
             * Get child categories from
             * the real Sanity taxonomy.
             */
            const sanityChildren: CatalogTag[] =
              categories
                .filter(
                  (
                    child,
                  ) =>
                    child.parentId ===
                      category._id &&
                    Boolean(
                      child.title,
                    ) &&
                    Boolean(
                      child.slug,
                    ),
                )
                .map(
                  (
                    child,
                  ) => ({
                    title:
                      child.title!,

                    slug:
                      child.slug!,

                    imageUrl:
                      child.imageUrl ||
                      null,
                  }),
                );

            return {
              id:
                category._id,

              title:
                category.title!,

              slug,

              description:
                category.description ||
                fallbackCategory
                  ?.description,

              /*
               * This URL comes directly
               * from the Sanity asset.
               */
              imageUrl:
                category.imageUrl ||
                null,

              /*
               * Sanity children take
               * priority.
               *
               * If the parent does not yet
               * have real children in Sanity,
               * use the fallback children.
               */
              children:
                sanityChildren
                  .length >
                0
                  ? sanityChildren
                  : fallbackCategory
                      ?.children ||
                    [],
            };
          },
        );

    /*
     * Keep any fallback top-level categories
     * that have not yet been created in
     * Sanity.
     */
    const sanitySlugs =
      new Set(
        sanityTopLevel.map(
          (
            category,
          ) =>
            category.slug,
        ),
      );

    const missingFallbackCategories =
      fallbackShopNavigation
        .categories
        .filter(
          (
            category,
          ) =>
            !sanitySlugs.has(
              category.slug,
            ),
        );

    const finalCategories: ShopCategory[] =
      [
        ...sanityTopLevel,
        ...missingFallbackCategories,
      ];

    const parsedSpaces =
      tagsFromReferences(
        spaces,
      );

    const parsedStyles =
      tagsFromReferences(
        styles,
      );

    const parsedCollections =
      tagsFromReferences(
        collections,
      );

    return {
      categories:
        finalCategories.length >
        0
          ? finalCategories
          : fallbackShopNavigation
              .categories,

      spaces:
        parsedSpaces.length >
        0
          ? parsedSpaces
          : fallbackShopNavigation
              .spaces,

      styles:
        parsedStyles.length >
        0
          ? parsedStyles
          : fallbackShopNavigation
              .styles,

      collections:
        parsedCollections.length >
        0
          ? parsedCollections
          : fallbackShopNavigation
              .collections,
    };
  } catch (error) {
    console.error(
      "Failed to load Sanity shop navigation:",
      error,
    );

    return fallbackShopNavigation;
  }
}
