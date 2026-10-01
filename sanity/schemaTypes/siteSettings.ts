import { defineField, defineType } from "sanity";

export const siteSettings = defineType({
  name: "siteSettings",
  title: "Site Settings",
  type: "document",
  groups: [
    { name: "brand", title: "Brand & contact" },
    { name: "home", title: "Home / Shop landing" },
    { name: "delivery", title: "Delivery pricing" },
    { name: "checkout", title: "Checkout" },
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
      name: "deliveryZones",
      title: "Delivery zones",
      description: "Checkout delivery options and their standard fees. These can also be managed from Admin → Settings.",
      type: "array",
      group: "delivery",
      initialValue: [
        { _key: "shop-pickup", _type: "object", id: "shop-pickup", label: "Shop pickup", description: "Collect from the Decor by Kasiwa shop.", fee: 0, active: true },
        { _key: "within-cbd", _type: "object", id: "within-cbd", label: "Within CBD", description: "Delivery within Nairobi CBD.", fee: 100, active: true },
        { _key: "outside-cbd-matatu", _type: "object", id: "outside-cbd-matatu", label: "Outside CBD via Matatu", fee: 150, active: true },
        { _key: "long-distance-matatu", _type: "object", id: "long-distance-matatu", label: "Long Distance Matatu", fee: 350, active: true },
        { _key: "neighbouring-countries", _type: "object", id: "neighbouring-countries", label: "Neighbouring Countries", fee: 1000, active: true },
        { _key: "international", _type: "object", id: "international", label: "International", description: "Delivery charge is confirmed separately before payment.", fee: 0, active: true, quoteRequired: true },
      ],
      of: [
        {
          type: "object",
          fields: [
            defineField({ name: "id", title: "Zone ID", type: "string", validation: (rule) => rule.required() }),
            defineField({ name: "label", title: "Display name", type: "string", validation: (rule) => rule.required() }),
            defineField({ name: "description", title: "Description", type: "string" }),
            defineField({ name: "fee", title: "Delivery fee (KES)", type: "number", validation: (rule) => rule.required().min(0) }),
            defineField({ name: "quoteRequired", title: "Price to be confirmed / TBA", type: "boolean", initialValue: false }),
            defineField({ name: "active", title: "Available at checkout", type: "boolean", initialValue: true }),
          ],
          preview: {
            select: { title: "label", fee: "fee", active: "active" },
            prepare({ title, fee, active }) {
              return {
                title: title || "Delivery zone",
                subtitle: `${active === false ? "Inactive · " : ""}KES ${Number(fee || 0).toLocaleString("en-KE")}`,
              };
            },
          },
        },
      ],
    }),

    defineField({
      name: "checkoutCustomerNotePrompt",
      title: "Checkout customer note prompt",
      description: "Short instruction shown above the optional 20-character customer note field at checkout. This can also be managed from Admin → Settings.",
      type: "string",
      group: "checkout",
      initialValue: "Add a short order note (optional)",
      validation: (rule) => rule.max(80),
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
