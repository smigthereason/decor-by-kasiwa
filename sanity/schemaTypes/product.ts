import { defineField, defineType } from "sanity";

export const product = defineType({
  name: "product",
  title: "Products",
  type: "document",
  fields: [
    defineField({ name: "name", title: "Product name", type: "string", validation: (rule) => rule.required() }),
    defineField({ name: "slug", title: "Slug", type: "slug", options: { source: "name", maxLength: 96 }, validation: (rule) => rule.required() }),
    defineField({
      name: "category",
      title: "Category",
      type: "string",
      options: {
        list: [
          "Furniture",
          "Curtains",
          "Blinds",
          "Rugs & Carpets",
          "Cushions",
          "Throws",
          "Lighting",
          "Mirrors",
          "Wall Art",
          "Decorative Accessories",
          "Vases",
          "Table Décor",
          "Soft Furnishings",
          "Statement Pieces"
        ]
      }
    }),
    defineField({ name: "price", title: "Price (KES)", type: "number" }),
    defineField({ name: "heroImage", title: "Hero image", type: "image", options: { hotspot: true } }),
    defineField({ name: "gallery", title: "Gallery", type: "array", of: [{ type: "image", options: { hotspot: true } }] }),
    defineField({ name: "description", title: "Description", type: "text", rows: 5 }),
    defineField({ name: "materials", title: "Materials / finishes", type: "array", of: [{ type: "string" }] }),
    defineField({ name: "dimensions", title: "Dimensions", type: "string" }),
    defineField({ name: "featured", title: "Featured product", type: "boolean", initialValue: false }),
    defineField({ name: "available", title: "Available", type: "boolean", initialValue: true })
  ],
});
