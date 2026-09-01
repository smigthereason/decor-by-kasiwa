import { defineField, defineType } from "sanity";

export const inventoryRecord = defineType({
  name: "inventoryRecord",
  title: "Inventory Record",
  type: "document",
  fields: [
    defineField({
      name: "product",
      title: "Product",
      type: "reference",
      to: [{ type: "product" }],
      validation: (Rule) => Rule.required(),
    }),
    defineField({ name: "location", title: "Store Location", type: "string", initialValue: "Unassigned" }),
    defineField({ name: "reserved", title: "Reserved Units", type: "number", initialValue: 0, validation: (Rule) => Rule.min(0) }),
    defineField({ name: "incoming", title: "Incoming Units", type: "number", initialValue: 0, validation: (Rule) => Rule.min(0) }),
    defineField({ name: "reorderPoint", title: "Reorder Point", type: "number", initialValue: 5, validation: (Rule) => Rule.min(0) }),
    defineField({ name: "unitCost", title: "Procurement Cost (KES)", type: "number", initialValue: 0, validation: (Rule) => Rule.min(0) }),
  ],
  preview: {
    select: { title: "product.name", subtitle: "location" },
    prepare({ title, subtitle }) {
      return { title: title || "Inventory record", subtitle: subtitle || "Unassigned" };
    },
  },
});
