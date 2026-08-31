import { defineField, defineType } from "sanity";

export const shopLook = defineType({
  name: "shopLook",
  title: "Shop by Look",
  type: "document",
  groups: [
    { name: "content", title: "Content", default: true },
    { name: "products", title: "Products" },
    { name: "visibility", title: "Visibility" },
    { name: "seo", title: "SEO" },
  ],
  fields: [
    defineField({
      name: "title",
      title: "Look name",
      type: "string",
      group: "content",
      validation: (rule) => rule.required().min(3),
    }),
    defineField({
      name: "slug",
      title: "Slug",
      type: "slug",
      group: "content",
      options: { source: "title", maxLength: 96 },
      validation: (rule) => rule.required(),
    }),
    defineField({
      name: "eyebrow",
      title: "Eyebrow",
      description: "Small label shown above the look title, for example: Living room edit.",
      type: "string",
      group: "content",
    }),
    defineField({
      name: "description",
      title: "Description",
      type: "text",
      rows: 5,
      group: "content",
      validation: (rule) => rule.required().min(20),
    }),
    defineField({
      name: "heroImage",
      title: "Hero image",
      description: "Optional. If omitted, the storefront uses the first selected product image.",
      type: "image",
      options: { hotspot: true },
      group: "content",
    }),
    defineField({
      name: "space",
      title: "Room / space",
      type: "reference",
      to: [{ type: "shopSpace" }],
      group: "content",
    }),
    defineField({
      name: "style",
      title: "Style",
      type: "reference",
      to: [{ type: "shopStyle" }],
      group: "content",
    }),
    defineField({
      name: "products",
      title: "Products in this look",
      type: "array",
      group: "products",
      validation: (rule) => rule.required().min(1),
      of: [
        {
          type: "object",
          name: "lookProduct",
          title: "Look product",
          fields: [
            defineField({
              name: "product",
              title: "Product",
              type: "reference",
              to: [{ type: "product" }],
              validation: (rule) => rule.required(),
            }),
            defineField({
              name: "quantity",
              title: "Quantity in complete look",
              type: "number",
              initialValue: 1,
              validation: (rule) => rule.required().integer().min(1).max(20),
            }),
            defineField({
              name: "note",
              title: "Styling note",
              description: "Optional short note explaining how this piece is used in the look.",
              type: "string",
            }),
          ],
          preview: {
            select: {
              title: "product.name",
              subtitle: "note",
              media: "product.heroImage",
              quantity: "quantity",
            },
            prepare({ title, subtitle, media, quantity }) {
              return {
                title: title || "Product",
                subtitle: [`Qty ${quantity || 1}`, subtitle].filter(Boolean).join(" • "),
                media,
              };
            },
          },
        },
      ],
    }),
    defineField({
      name: "featured",
      title: "Featured look",
      description: "Featured looks can be promoted on the homepage.",
      type: "boolean",
      initialValue: false,
      group: "visibility",
    }),
    defineField({
      name: "active",
      title: "Published on customer site",
      type: "boolean",
      initialValue: true,
      group: "visibility",
    }),
    defineField({
      name: "displayOrder",
      title: "Display order",
      type: "number",
      initialValue: 100,
      group: "visibility",
      validation: (rule) => rule.integer().min(0),
    }),
    defineField({
      name: "seoTitle",
      title: "SEO title",
      type: "string",
      group: "seo",
      validation: (rule) => rule.max(70),
    }),
    defineField({
      name: "seoDescription",
      title: "SEO description",
      type: "text",
      rows: 3,
      group: "seo",
      validation: (rule) => rule.max(180),
    }),
  ],
  orderings: [
    {
      title: "Display order",
      name: "displayOrder",
      by: [
        { field: "displayOrder", direction: "asc" },
        { field: "title", direction: "asc" },
      ],
    },
  ],
  preview: {
    select: {
      title: "title",
      media: "heroImage",
      active: "active",
      featured: "featured",
      space: "space.title",
    },
    prepare({ title, media, active, featured, space }) {
      return {
        title,
        subtitle: [
          space,
          featured ? "Featured" : null,
          active === false ? "Hidden" : "Live",
        ]
          .filter(Boolean)
          .join(" • "),
        media,
      };
    },
  },
});
