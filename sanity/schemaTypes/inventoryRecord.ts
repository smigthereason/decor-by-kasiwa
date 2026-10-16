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
    defineField({ name: "location", title: "Legacy / default store location", type: "string", initialValue: "Unassigned", description: "Kept for backwards compatibility. New branch stock is tracked in Location balances below." }),
    defineField({
      name: "locationBalances",
      title: "Location balances",
      description: "Sellable and incoming stock separated by client-created store/location.",
      type: "array",
      of: [{
        type: "object",
        fields: [
          defineField({ name: "store", title: "Store", type: "reference", to: [{ type: "storeLocation" }], validation: (Rule) => Rule.required() }),
          defineField({ name: "storeName", title: "Store name snapshot", type: "string", hidden: true }),
          defineField({ name: "storeCode", title: "Store code snapshot", type: "string", hidden: true }),
          defineField({ name: "onHand", title: "On hand", type: "number", initialValue: 0, validation: (Rule) => Rule.min(0) }),
          defineField({ name: "incoming", title: "Incoming", type: "number", initialValue: 0, validation: (Rule) => Rule.min(0) }),
          defineField({
            name: "variants", title: "Variant balances", type: "array",
            of: [{
              type: "object",
              fields: [
                defineField({ name: "variantId", title: "Variant ID", type: "string", validation: (Rule) => Rule.required() }),
                defineField({ name: "variantLabel", title: "Variant", type: "string" }),
                defineField({ name: "onHand", title: "On hand", type: "number", initialValue: 0, validation: (Rule) => Rule.min(0) }),
                defineField({ name: "incoming", title: "Incoming", type: "number", initialValue: 0, validation: (Rule) => Rule.min(0) }),
              ],
              preview: { select: { title: "variantLabel", onHand: "onHand", incoming: "incoming" }, prepare({ title, onHand, incoming }) { return { title: title || "Variant", subtitle: `${Number(onHand || 0)} on hand · ${Number(incoming || 0)} incoming` }; } },
            }],
          }),
        ],
        preview: { select: { title: "storeName", code: "storeCode", onHand: "onHand", incoming: "incoming" }, prepare({ title, code, onHand, incoming }) { return { title: title || code || "Store", subtitle: `${Number(onHand || 0)} on hand · ${Number(incoming || 0)} incoming` }; } },
      }],
    }),
    defineField({ name: "reserved", title: "Reserved Units", type: "number", initialValue: 0, validation: (Rule) => Rule.min(0) }),
    defineField({ name: "incoming", title: "Incoming Units", type: "number", initialValue: 0, validation: (Rule) => Rule.min(0) }),
    defineField({
      name: "incomingByVariant",
      title: "Incoming Units by Variant",
      description: "Tracks purchased stock awaiting receipt for products that use variants.",
      type: "array",
      of: [{
        type: "object",
        fields: [
          defineField({ name: "variantId", title: "Variant ID", type: "string", validation: (Rule) => Rule.required() }),
          defineField({ name: "variantLabel", title: "Variant", type: "string" }),
          defineField({ name: "quantity", title: "Incoming Quantity", type: "number", validation: (Rule) => Rule.min(0) }),
        ],
        preview: {
          select: { title: "variantLabel", quantity: "quantity" },
          prepare({ title, quantity }) {
            return { title: title || "Variant", subtitle: `${Number(quantity || 0)} incoming` };
          },
        },
      }],
    }),
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
