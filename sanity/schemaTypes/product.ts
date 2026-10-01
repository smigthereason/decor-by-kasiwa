import { defineField, defineType } from "sanity";
import { AutoSkuInput } from "../components/AutoSkuInput";

export const product = defineType({
  name: "product",
  title: "Products",
  type: "document",
  groups: [
    { name: "core", title: "Product" },
    { name: "merchandising", title: "Categories & Merchandising" },
    { name: "media", title: "Media" },
    { name: "details", title: "Details" },
    { name: "visibility", title: "Visibility" },
  ],
  fields: [
    defineField({
      name: "name",
      title: "Product name",
      type: "string",
      group: "core",
      validation: (rule) => rule.required(),
    }),
    defineField({
      name: "slug",
      title: "Slug",
      type: "slug",
      group: "core",
      options: { source: "name", maxLength: 96 },
      validation: (rule) => rule.required(),
    }),
    defineField({
      name: "sku",
      title: "SKU",
      description: "Generated automatically when empty. Once assigned, keep the SKU stable even if the product name changes.",
      type: "string",
      group: "core",
      components: { input: AutoSkuInput },
      validation: (rule) =>
        rule
          .required()
          .regex(/^DBK-[A-Z0-9]{2,4}-[A-Z0-9]{6}$/, {
            name: "DBK SKU",
            invert: false,
          })
          .custom(async (sku, context) => {
            if (!sku) return true;

            const currentId = String(context.document?._id ?? "").replace(/^drafts\./, "");
            const draftId = currentId ? `drafts.${currentId}` : "";
            const client = context.getClient({ apiVersion: "2025-01-01" });
            const duplicateCount = await client.fetch<number>(
              `count(*[_type == "product" && sku == $sku && !(_id in [$publishedId, $draftId])])`,
              { sku, publishedId: currentId, draftId },
            );

            return duplicateCount === 0 || "SKU must be unique.";
          }),
    }),
    defineField({
      name: "price",
      title: "Retail price (KES)",
      description: "Standard per-item price used below the wholesale quantity threshold.",
      type: "number",
      group: "core",
      validation: (rule) => rule.required().min(1),
    }),
    defineField({
      name: "wholesalePrice",
      title: "Wholesale price (KES)",
      description: "Optional per-item price used when the customer reaches the wholesale quantity threshold.",
      type: "number",
      group: "core",
      validation: (rule) => rule.min(1).custom((value, context) => {
        const threshold = Number(context.document?.wholesaleMinQuantity || 0);
        const retail = Number(context.document?.price || 0);
        if (value == null && !threshold) return true;
        if (value == null) return "Wholesale price is required when a wholesale quantity is set.";
        if (retail > 0 && Number(value) >= retail) return "Wholesale price must be lower than the retail price.";
        return true;
      }),
    }),
    defineField({
      name: "wholesaleMinQuantity",
      title: "Wholesale quantity threshold",
      description: "Minimum quantity required before the wholesale price applies. Example: 5 means 1–4 use retail price and 5+ use wholesale price.",
      type: "number",
      group: "core",
      validation: (rule) => rule.integer().min(2).custom((value, context) => {
        const wholesalePrice = Number(context.document?.wholesalePrice || 0);
        if (value == null && !wholesalePrice) return true;
        if (value == null) return "Wholesale quantity is required when a wholesale price is set.";
        return true;
      }),
    }),
    defineField({
      name: "procurementCost",
      title: "Procurement cost (KES)",
      description: "Initial/procurement cost used for profit and loss reporting.",
      type: "number",
      group: "core",
      validation: (rule) => rule.min(0),
    }),
    defineField({
      name: "compareAtPrice",
      title: "Compare-at price (KES)",
      description: "Optional original price for offers/sale presentation.",
      type: "number",
      group: "core",
      validation: (rule) => rule.min(0),
    }),
    defineField({
      name: "rating",
      title: "Display rating",
      description: "Optional curated social-proof rating. Leave empty to use the deterministic 4.0–4.8 fallback.",
      type: "number",
      group: "core",
      validation: (rule) => rule.min(4).max(4.8),
    }),
    defineField({
      name: "reviewCount",
      title: "Display review count",
      description: "Optional display count used alongside the rating until verified customer reviews are introduced.",
      type: "number",
      group: "core",
      validation: (rule) => rule.integer().min(0),
    }),
    defineField({
      name: "primaryCategory",
      title: "Primary category",
      type: "reference",
      to: [{ type: "category" }],
      group: "merchandising",
      validation: (rule) => rule.required(),
    }),
    defineField({
      name: "categories",
      title: "Additional categories",
      type: "array",
      group: "merchandising",
      of: [{ type: "reference", to: [{ type: "category" }] }],
    }),
    defineField({
      name: "collections",
      title: "Collections",
      type: "array",
      group: "merchandising",
      of: [{ type: "reference", to: [{ type: "collection" }] }],
    }),
    defineField({
      name: "pairings",
      title: "Pair it with",
      description: "Curate complementary products for this item, for example flowers that pair with a vase.",
      type: "array",
      group: "merchandising",
      of: [{ type: "reference", to: [{ type: "product" }] }],
      validation: (rule) => rule.unique(),
    }),
    defineField({
      name: "merchandisedSamples",
      title: "Merchandised samples",
      description: "Choose products that demonstrate how this item can be merchandised or styled in-store.",
      type: "array",
      group: "merchandising",
      of: [{ type: "reference", to: [{ type: "product" }] }],
      validation: (rule) => rule.unique(),
    }),
    defineField({
      name: "spaces",
      title: "Shop by Space",
      type: "array",
      group: "merchandising",
      of: [{ type: "reference", to: [{ type: "shopSpace" }] }],
    }),
    defineField({
      name: "styles",
      title: "Shop by Style",
      type: "array",
      group: "merchandising",
      of: [{ type: "reference", to: [{ type: "shopStyle" }] }],
    }),
    defineField({ name: "heroImage", title: "Hero image", type: "image", group: "media", options: { hotspot: true } }),
    defineField({ name: "gallery", title: "Gallery", type: "array", group: "media", of: [{ type: "image", options: { hotspot: true } }] }),
    defineField({ name: "shortDescription", title: "Short description", type: "text", rows: 3, group: "details" }),
    defineField({ name: "description", title: "Full description", type: "text", rows: 6, group: "details" }),
    defineField({ name: "colours", title: "Colours", type: "array", group: "details", of: [{ type: "string" }] }),
    defineField({
      name: "variants",
      title: "Product variants",
      description: "Optional colour/size variants. Add an image to a variant so selecting that colour or size switches the customer-facing product image.",
      type: "array",
      group: "details",
      of: [
        {
          type: "object",
          fields: [
            defineField({ name: "title", title: "Variant label", type: "string" }),
            defineField({ name: "colour", title: "Colour", type: "string" }),
            defineField({ name: "size", title: "Size", type: "string" }),
            defineField({ name: "sku", title: "Variant SKU", type: "string" }),
            defineField({ name: "price", title: "Variant price (KES)", type: "number", validation: (rule) => rule.min(1) }),
            defineField({ name: "stockQuantity", title: "Variant stock", type: "number", validation: (rule) => rule.min(0) }),
            defineField({ name: "image", title: "Variant image", type: "image", options: { hotspot: true } }),
          ],
          preview: {
            select: { title: "title", colour: "colour", size: "size", media: "image" },
            prepare({ title, colour, size, media }) {
              return {
                title: title || [colour, size].filter(Boolean).join(" · ") || "Variant",
                subtitle: [colour, size].filter(Boolean).join(" · "),
                media,
              };
            },
          },
        },
      ],
    }),
    defineField({ name: "materials", title: "Materials / finishes", type: "array", group: "details", of: [{ type: "string" }] }),
    defineField({ name: "dimensions", title: "Dimensions", type: "string", group: "details" }),
    defineField({ name: "careInstructions", title: "Care instructions", type: "text", rows: 4, group: "details" }),
    defineField({
      name: "initialStock",
      title: "Initial stock / migration quantity",
      description: "Used only while importing the existing catalogue. Operational stock will move to the fulfilment data layer.",
      type: "number",
      group: "details",
      validation: (rule) => rule.min(0),
    }),
    defineField({ name: "ecommerceEnabled", title: "Sell on e-commerce", description: "Show this product on the customer-facing online shop.", type: "boolean", group: "visibility", initialValue: true }),
    defineField({ name: "posEnabled", title: "Sell on POS", description: "Make this product available to staff in Point of Sale.", type: "boolean", group: "visibility", initialValue: true }),
    defineField({ name: "featured", title: "Featured product", type: "boolean", group: "visibility", initialValue: false }),
    defineField({ name: "newArrival", title: "New arrival", type: "boolean", group: "visibility", initialValue: false }),
    defineField({ name: "bestSeller", title: "Best seller", type: "boolean", group: "visibility", initialValue: false }),
    defineField({ name: "onSale", title: "On sale", type: "boolean", group: "visibility", initialValue: false }),
    defineField({
      name: "salePrice",
      title: "Sale price",
      description: "Price used only while the sale schedule is active. It must be lower than the retail price.",
      type: "number",
      group: "visibility",
      hidden: ({ document }) => document?.onSale !== true,
      validation: (rule) => rule.positive().custom((value, context) => {
        const retail = Number(context.document?.price || 0);
        if (!value || !retail) return true;
        return Number(value) < retail || "Sale price must be lower than the retail price.";
      }),
    }),
    defineField({
      name: "saleStartAt",
      title: "Sale starts",
      description: "Optional. When supplied, sale pricing becomes active from this date/time.",
      type: "datetime",
      group: "visibility",
      hidden: ({ document }) => document?.onSale !== true,
    }),
    defineField({
      name: "saleEndAt",
      title: "Sale ends",
      description: "Optional. After this date/time the product automatically returns to its normal retail price.",
      type: "datetime",
      group: "visibility",
      hidden: ({ document }) => document?.onSale !== true,
      validation: (rule) => rule.custom((value, context) => {
        const start = context.document?.saleStartAt;
        if (!value || !start) return true;
        return new Date(String(value)).getTime() > new Date(String(start)).getTime() || "Sale end must be after sale start.";
      }),
    }),
    defineField({ name: "available", title: "Available", type: "boolean", group: "visibility", initialValue: true }),
  ],
  orderings: [
    { title: "Product name A-Z", name: "nameAsc", by: [{ field: "name", direction: "asc" }] },
    { title: "Price low-high", name: "priceAsc", by: [{ field: "price", direction: "asc" }] },
    { title: "Price high-low", name: "priceDesc", by: [{ field: "price", direction: "desc" }] },
  ],
  preview: {
    select: {
      title: "name",
      subtitle: "primaryCategory.title",
      media: "heroImage",
      price: "price",
      available: "available",
    },
    prepare({ title, subtitle, media, price, available }) {
      const priceText = typeof price === "number" ? `KES ${price.toLocaleString()}` : "No price";
      return {
        title,
        subtitle: [subtitle, priceText, available === false ? "Unavailable" : null].filter(Boolean).join(" • "),
        media,
      };
    },
  },
});
