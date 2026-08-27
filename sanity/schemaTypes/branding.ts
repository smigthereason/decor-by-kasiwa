import { defineField, defineType } from "sanity";

export const branding = defineType({
  name: "branding",
  title: "Logo & Branding",
  type: "document",
  fields: [
    defineField({ name: "brandName", title: "Brand name", type: "string", initialValue: "Decor by Kasiwa" }),
    defineField({ name: "primaryLogo", title: "Primary logo", type: "image", options: { hotspot: true } }),
    defineField({ name: "lightLogo", title: "Light / inverse logo", type: "image", options: { hotspot: true } }),
    defineField({ name: "favicon", title: "Favicon", type: "image" }),
    defineField({ name: "tagline", title: "Tagline", type: "string" }),
    defineField({
      name: "palette",
      title: "Approved brand palette",
      type: "object",
      readOnly: true,
      fields: [
        defineField({ name: "deepGreen", title: "Deep Green", type: "string", initialValue: "#0E2B26" }),
        defineField({ name: "sageGreen", title: "Sage Green", type: "string", initialValue: "#8CA78B" }),
        defineField({ name: "warmBeige", title: "Warm Beige", type: "string", initialValue: "#E8DFCF" }),
        defineField({ name: "softCream", title: "Soft Cream", type: "string", initialValue: "#FAF7F2" }),
        defineField({ name: "gold", title: "Gold", type: "string", initialValue: "#D4AF37" }),
        defineField({ name: "charcoal", title: "Charcoal", type: "string", initialValue: "#1F2321" }),
      ],
    }),
  ],
  preview: {
    prepare() {
      return { title: "Decor by Kasiwa branding" };
    },
  },
});
