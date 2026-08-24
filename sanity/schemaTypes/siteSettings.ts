import { defineField, defineType } from "sanity";

export const siteSettings = defineType({
  name: "siteSettings",
  title: "Site Settings",
  type: "document",
  fields: [
    defineField({ name: "brandName", title: "Brand name", type: "string", initialValue: "Decor by Kasiwa" }),
    defineField({ name: "tagline", title: "Tagline", type: "string", initialValue: "Transforming spaces into places that feel like you." }),
    defineField({ name: "email", title: "Contact email", type: "string" }),
    defineField({ name: "phone", title: "Phone", type: "string" }),
    defineField({ name: "instagram", title: "Instagram URL", type: "url" }),
    defineField({ name: "whatsapp", title: "WhatsApp number", type: "string" })
  ],
});
