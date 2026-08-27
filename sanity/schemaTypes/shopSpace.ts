import { defineField, defineType } from "sanity";

export const shopSpace = defineType({
  name: "shopSpace",
  title: "Shop by Space",
  type: "document",
  fields: [
    defineField({ name: "title", title: "Space name", type: "string", validation: (rule) => rule.required() }),
    defineField({ name: "slug", title: "Slug", type: "slug", options: { source: "title", maxLength: 96 }, validation: (rule) => rule.required() }),
    defineField({ name: "description", title: "Description", type: "text", rows: 3 }),
    defineField({ name: "image", title: "Image", type: "image", options: { hotspot: true } }),
    defineField({ name: "displayOrder", title: "Display order", type: "number", initialValue: 100 }),
    defineField({ name: "active", title: "Active", type: "boolean", initialValue: true }),
  ],
  orderings: [
    { title: "Display order", name: "displayOrder", by: [{ field: "displayOrder", direction: "asc" }] },
  ],
  preview: { select: { title: "title", media: "image", active: "active" } },
});
