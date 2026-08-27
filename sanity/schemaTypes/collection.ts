import { defineField, defineType } from "sanity";

export const collection = defineType({
  name: "collection",
  title: "Collections",
  type: "document",
  fields: [
    defineField({
      name: "title",
      title: "Collection name",
      type: "string",
      validation: (rule) => rule.required(),
    }),
    defineField({
      name: "slug",
      title: "Slug",
      type: "slug",
      options: { source: "title", maxLength: 96 },
      validation: (rule) => rule.required(),
    }),
    defineField({
      name: "kind",
      title: "Collection type",
      type: "string",
      initialValue: "curated",
      options: {
        list: [
          { title: "Curated collection", value: "curated" },
          { title: "New arrivals", value: "new-arrivals" },
          { title: "Best sellers", value: "best-sellers" },
          { title: "Offers", value: "offers" },
          { title: "Clearance", value: "clearance" },
        ],
        layout: "radio",
      },
    }),
    defineField({ name: "description", title: "Description", type: "text", rows: 4 }),
    defineField({ name: "heroImage", title: "Collection image", type: "image", options: { hotspot: true } }),
    defineField({ name: "displayOrder", title: "Display order", type: "number", initialValue: 100 }),
    defineField({ name: "active", title: "Active", type: "boolean", initialValue: true }),
  ],
  orderings: [
    { title: "Display order", name: "displayOrder", by: [{ field: "displayOrder", direction: "asc" }] },
  ],
  preview: {
    select: { title: "title", kind: "kind", media: "heroImage", active: "active" },
    prepare({ title, kind, media, active }) {
      return {
        title,
        subtitle: `${kind || "curated"}${active === false ? " • Inactive" : ""}`,
        media,
      };
    },
  },
});
