import { defineField, defineType } from "sanity";

export const inventoryMovementCorrection = defineType({
  name: "inventoryMovementCorrection",
  title: "Stock Movement Correction Audit",
  type: "document",
  fields: [
    defineField({ name: "originalMovement", title: "Original Movement", type: "reference", to: [{ type: "inventoryMovement" }], validation: (Rule) => Rule.required() }),
    defineField({ name: "movementNumber", title: "Movement Number", type: "string" }),
    defineField({ name: "product", title: "Product", type: "reference", to: [{ type: "product" }] }),
    defineField({ name: "movementType", title: "Movement Type", type: "string" }),
    defineField({ name: "variantId", title: "Variant ID", type: "string" }),
    defineField({ name: "sourceStoreId", title: "Source Store ID", type: "string" }),
    defineField({ name: "destinationStoreId", title: "Destination Store ID", type: "string" }),
    defineField({ name: "previousQuantity", title: "Before (units)", type: "number" }),
    defineField({ name: "correctedQuantity", title: "After (units)", type: "number" }),
    defineField({ name: "difference", title: "Adjustment (units)", type: "number" }),
    defineField({ name: "correctionType", title: "Correction Type", type: "string", options: { list: [{ title: "Edit quantity", value: "EDIT" }, { title: "Void movement", value: "VOID" }] } }),
    defineField({ name: "companyOnHandAfter", title: "Company On Hand After", type: "number" }),
    defineField({ name: "incomingAfter", title: "Incoming After", type: "number" }),
    defineField({ name: "reason", title: "Correction Reason", type: "text" }),
    defineField({ name: "actor", title: "Corrected By", type: "reference", to: [{ type: "customerUser" }] }),
    defineField({ name: "actorName", title: "Actor Name", type: "string" }),
    defineField({ name: "actorRole", title: "Actor Role", type: "string" }),
    defineField({ name: "createdAt", title: "Corrected At", type: "datetime" }),
  ],
  orderings: [{ title: "Newest first", name: "createdAtDesc", by: [{ field: "createdAt", direction: "desc" }] }],
  preview: { select: { title: "movementNumber", before: "previousQuantity", after: "correctedQuantity" }, prepare({ title, before, after }) { return { title: title || "Stock correction", subtitle: `${before} → ${after} units` }; } },
});
