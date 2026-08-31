import { defineField, defineType } from "sanity";

export const inventoryMovement = defineType({
  name: "inventoryMovement",
  title: "Inventory Movement",
  type: "document",
  fields: [
    defineField({ name: "movementNumber", title: "Movement Number", type: "string", validation: (Rule) => Rule.required() }),
    defineField({ name: "movementType", title: "Movement Type", type: "string", validation: (Rule) => Rule.required(), options: { list: [
      { title: "Sale", value: "SALE" }, { title: "Return", value: "RETURN" }, { title: "Refund Restock", value: "REFUND_RESTOCK" }, { title: "Adjustment", value: "ADJUSTMENT" },
    ] } }),
    defineField({ name: "product", title: "Product", type: "reference", to: [{ type: "product" }], validation: (Rule) => Rule.required() }),
    defineField({ name: "productId", title: "Product ID", type: "string" }),
    defineField({ name: "productName", title: "Product Name", type: "string" }),
    defineField({ name: "variantId", title: "Variant ID", type: "string" }),
    defineField({ name: "quantityChange", title: "Quantity Change", type: "number", validation: (Rule) => Rule.required() }),
    defineField({ name: "stockBefore", title: "Stock Before", type: "number" }),
    defineField({ name: "stockAfter", title: "Stock After", type: "number" }),
    defineField({ name: "order", title: "Order", type: "reference", to: [{ type: "commerceOrder" }] }),
    defineField({ name: "orderNumber", title: "Order Number", type: "string" }),
    defineField({ name: "actor", title: "Actor", type: "reference", to: [{ type: "customerUser" }] }),
    defineField({ name: "actorName", title: "Actor Name", type: "string" }),
    defineField({ name: "actorRole", title: "Actor Role", type: "string" }),
    defineField({ name: "note", title: "Note", type: "text", rows: 3 }),
    defineField({ name: "createdAt", title: "Created At", type: "datetime", validation: (Rule) => Rule.required() }),
  ],
  orderings: [{ title: "Newest first", name: "createdAtDesc", by: [{ field: "createdAt", direction: "desc" }] }],
  preview: {
    select: { title: "productName", movementType: "movementType", qty: "quantityChange", order: "orderNumber" },
    prepare({ title, movementType, qty, order }) {
      return { title: title || "Inventory movement", subtitle: `${movementType || "MOVEMENT"} · ${Number(qty || 0) > 0 ? "+" : ""}${Number(qty || 0)} · ${order || "No order"}` };
    },
  },
});
