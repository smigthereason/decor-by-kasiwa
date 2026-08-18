import { defineField, defineType } from "sanity";

export const project = defineType({
  name: "project",
  title: "Portfolio Projects",
  type: "document",
  fields: [
    defineField({ name: "title", title: "Project name", type: "string", validation: (rule) => rule.required() }),
    defineField({ name: "slug", title: "Slug", type: "slug", options: { source: "title" }, validation: (rule) => rule.required() }),
    defineField({
      name: "category",
      title: "Category",
      type: "string",
      options: { list: ["Residential", "Commercial", "Hospitality", "Before & After", "Bespoke"] }
    }),
    defineField({ name: "location", title: "Location", type: "string" }),
    defineField({ name: "year", title: "Year", type: "number" }),
    defineField({ name: "heroImage", title: "Hero image", type: "image", options: { hotspot: true } }),
    defineField({ name: "gallery", title: "Project gallery", type: "array", of: [{ type: "image", options: { hotspot: true } }] }),
    defineField({ name: "beforeImage", title: "Before image", type: "image", options: { hotspot: true } }),
    defineField({ name: "afterImage", title: "After image", type: "image", options: { hotspot: true } }),
    defineField({ name: "summary", title: "Project summary", type: "text", rows: 5 }),
    defineField({ name: "services", title: "Services used", type: "array", of: [{ type: "string" }] }),
    defineField({ name: "materials", title: "Materials / finishes", type: "array", of: [{ type: "string" }] }),
    defineField({ name: "testimonial", title: "Client testimonial", type: "text", rows: 4 }),
    defineField({ name: "featured", title: "Featured project", type: "boolean", initialValue: false })
  ],
});
