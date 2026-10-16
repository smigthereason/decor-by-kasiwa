import { defineField, defineType } from "sanity";

export const storeLocation = defineType({
  name: "storeLocation",
  title: "Stores / Locations",
  type: "document",
  fields: [
    defineField({ name: "name", title: "Store name", type: "string", validation: (Rule) => Rule.required().min(2) }),
    defineField({ name: "code", title: "Store code", type: "string", description: "Short code used in operations, for example MAIN or BRANCH-02.", validation: (Rule) => Rule.required().min(2) }),
    defineField({ name: "address", title: "Address / description", type: "string" }),
    defineField({ name: "active", title: "Active", type: "boolean", initialValue: true }),
    defineField({ name: "createdAt", title: "Created at", type: "datetime", readOnly: true }),
    defineField({ name: "updatedAt", title: "Updated at", type: "datetime", readOnly: true }),
  ],
  orderings: [{ title: "Name", name: "nameAsc", by: [{ field: "name", direction: "asc" }] }],
  preview: {
    select: { title: "name", subtitle: "code", active: "active" },
    prepare({ title, subtitle, active }) {
      return { title: title || "Store", subtitle: `${subtitle || "NO-CODE"}${active === false ? " · Inactive" : ""}` };
    },
  },
});
