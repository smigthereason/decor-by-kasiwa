import { defineArrayMember, defineField, defineType } from "sanity";

export const returnTransaction = defineType({
  name: "returnTransaction",
  title: "Return / Refund",
  type: "document",
  fields: [
    defineField({ name: "returnNumber", title: "Return Number", type: "string", validation: (Rule) => Rule.required() }),
    defineField({ name: "order", title: "Order", type: "reference", to: [{ type: "commerceOrder" }], validation: (Rule) => Rule.required() }),
    defineField({ name: "orderNumber", title: "Order Number", type: "string" }),
    defineField({ name: "reason", title: "Reason", type: "text", rows: 3, validation: (Rule) => Rule.required() }),
    defineField({ name: "refundAmount", title: "Refund Amount", type: "number", validation: (Rule) => Rule.required().min(0) }),
    defineField({ name: "restock", title: "Restock Returned Items", type: "boolean", initialValue: true }),
    defineField({ name: "status", title: "Status", type: "string", initialValue: "completed", options: { list: [
      { title: "Completed", value: "completed" }, { title: "Pending Provider Refund", value: "pending_provider" }, { title: "Failed", value: "failed" },
    ] } }),
    defineField({ name: "providerRefundId", title: "Provider Refund ID", type: "string" }),
    defineField({ name: "items", title: "Returned Items", type: "array", of: [defineArrayMember({ type: "object", fields: [
      defineField({ name: "product", title: "Product", type: "reference", to: [{ type: "product" }] }),
      defineField({ name: "productId", title: "Product ID", type: "string" }),
      defineField({ name: "name", title: "Name", type: "string" }),
      defineField({ name: "variantId", title: "Variant ID", type: "string" }),
      defineField({ name: "quantity", title: "Quantity", type: "number", validation: (Rule) => Rule.required().min(1) }),
      defineField({ name: "unitPrice", title: "Unit Price", type: "number", validation: (Rule) => Rule.required().min(0) }),
    ] })] }),
    defineField({ name: "processedBy", title: "Processed By", type: "reference", to: [{ type: "customerUser" }] }),
    defineField({ name: "processedByName", title: "Processed By Name", type: "string" }),
    defineField({ name: "processedByRole", title: "Processed By Role", type: "string" }),
    defineField({ name: "createdAt", title: "Created At", type: "datetime", validation: (Rule) => Rule.required() }),
  ],
  orderings: [{ title: "Newest first", name: "createdAtDesc", by: [{ field: "createdAt", direction: "desc" }] }],
});
