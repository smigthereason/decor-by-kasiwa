import { defineField, defineType } from "sanity";

export const siteSettings = defineType({
  name: "siteSettings",
  title: "Site Settings",
  type: "document",
  groups: [
    { name: "brand", title: "Brand & contact" },
    { name: "home", title: "Home / Shop landing" },
    { name: "seo", title: "SEO" },
  ],
  fields: [
    defineField({ name: "brandName", title: "Brand name", type: "string", initialValue: "Decor by Kasiwa", group: "brand" }),
    defineField({ name: "tagline", title: "Tagline", type: "string", initialValue: "Transforming spaces into places that feel like you.", group: "brand" }),
    defineField({ name: "email", title: "Contact email", type: "string", group: "brand" }),
    defineField({ name: "phone", title: "Phone", type: "string", group: "brand" }),
    defineField({ name: "instagram", title: "Instagram URL", type: "url", group: "brand" }),
    defineField({ name: "whatsapp", title: "WhatsApp number", type: "string", group: "brand" }),

    defineField({
      name: "homeHeroEyebrow",
      title: "Hero eyebrow",
      type: "string",
      group: "home",
      initialValue: "Beautiful spaces decor",
    }),
    defineField({
      name: "homeHeroTitle",
      title: "Hero title",
      type: "string",
      group: "home",
      initialValue: "Beautiful spaces don't have to cost a fortune.",
    }),
    defineField({
      name: "homeHeroBody",
      title: "Hero description",
      type: "text",
      rows: 3,
      group: "home",
      initialValue: "Shop curated décor, greenery, mirrors, lighting and finishing pieces in a simpler, faster shopping experience.",
    }),
    defineField({
      name: "homeHeroCtaLabel",
      title: "Hero button label",
      type: "string",
      group: "home",
      initialValue: "Shop now",
    }),
    defineField({
      name: "homeHeroImage",
      title: "Hero image",
      type: "image",
      options: { hotspot: true },
      group: "home",
      description: "Optional. If empty, the landing page uses a featured product image from the live catalogue.",
    }),

    defineField({
      name: "seoTitle",
      title: "Homepage SEO title",
      type: "string",
      group: "seo",
      validation: (rule) => rule.max(60),
    }),
    defineField({
      name: "seoDescription",
      title: "Homepage SEO description",
      type: "text",
      rows: 3,
      group: "seo",
      validation: (rule) => rule.max(160),
    }),
  ],
});
