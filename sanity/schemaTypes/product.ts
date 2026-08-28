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
      title: "Price (KES)",
      type: "number",
      group: "core",
      validation: (rule) => rule.required().min(1),
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
    defineField({ name: "featured", title: "Featured product", type: "boolean", group: "visibility", initialValue: false }),
    defineField({ name: "newArrival", title: "New arrival", type: "boolean", group: "visibility", initialValue: false }),
    defineField({ name: "bestSeller", title: "Best seller", type: "boolean", group: "visibility", initialValue: false }),
    defineField({ name: "onSale", title: "On sale", type: "boolean", group: "visibility", initialValue: false }),
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
