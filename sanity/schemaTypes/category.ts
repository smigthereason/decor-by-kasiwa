import { defineField, defineType } from "sanity";

export const category = defineType({
  name: "category",
  title: "Categories",
  type: "document",
  fields: [
    defineField({
      name: "title",
      title: "Category name",
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
      name: "parent",
      title: "Parent category",
      description: "Leave empty for a top-level Shop category.",
      type: "reference",
      to: [{ type: "category" }],
    }),
    defineField({
      name: "description",
      title: "Description",
      type: "text",
      rows: 4,
    }),
    defineField({
      name: "image",
      title: "Category image",
      type: "image",
      options: { hotspot: true },
    }),
    defineField({
      name: "displayOrder",
      title: "Display order",
      type: "number",
      initialValue: 100,
    }),
    defineField({
      name: "showInNavigation",
      title: "Show in Shop navigation",
      type: "boolean",
      initialValue: true,
    }),
    defineField({
      name: "active",
      title: "Active",
      type: "boolean",
      initialValue: true,
    }),
  ],
  orderings: [
    {
      title: "Navigation order",
      name: "navigationOrder",
      by: [{ field: "displayOrder", direction: "asc" }],
    },
  ],
  preview: {
    select: {
      title: "title",
      parent: "parent.title",
      media: "image",
      active: "active",
    },
    prepare({ title, parent, media, active }) {
      const detail = [parent ? `Under ${parent}` : "Top level", active === false ? "Inactive" : null]
        .filter(Boolean)
        .join(" • ");

      return { title, subtitle: detail, media };
    },
  },
});
