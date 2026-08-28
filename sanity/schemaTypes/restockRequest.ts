import { defineField, defineType } from "sanity";

export const restockRequest = defineType({
  name: "restockRequest",
  title: "Restock Request",
  type: "document",
  fields: [
    defineField({
      name: "product",
      title: "Product",
      type: "reference",
      to: [{ type: "product" }],
      validation: (Rule) => Rule.required(),
    }),
    defineField({ name: "productName", title: "Product Name Snapshot", type: "string" }),
    defineField({ name: "sku", title: "SKU Snapshot", type: "string" }),
    defineField({
      name: "requestedBy",
      title: "Requested By",
      type: "reference",
      to: [{ type: "customerUser" }],
      validation: (Rule) => Rule.required(),
    }),
    defineField({ name: "requestedByName", title: "Requested By Name", type: "string" }),
    defineField({
      name: "reason",
      title: "Reason",
      type: "string",
      initialValue: "needs_restock",
      options: {
        list: [
          { title: "Out of stock", value: "out_of_stock" },
          { title: "Low stock", value: "low_stock" },
          { title: "Needs restocking", value: "needs_restock" },
        ],
      },
      validation: (Rule) => Rule.required(),
    }),
    defineField({ name: "note", title: "Staff Note", type: "text", rows: 3 }),
    defineField({
      name: "status",
      title: "Status",
      type: "string",
      initialValue: "open",
      options: {
        list: [
          { title: "Open", value: "open" },
          { title: "Acknowledged", value: "acknowledged" },
          { title: "Resolved", value: "resolved" },
        ],
      },
      validation: (Rule) => Rule.required(),
    }),
    defineField({ name: "createdAt", title: "Created At", type: "datetime", validation: (Rule) => Rule.required() }),
    defineField({ name: "updatedAt", title: "Updated At", type: "datetime" }),
    defineField({ name: "resolvedAt", title: "Resolved At", type: "datetime" }),
    defineField({ name: "resolvedBy", title: "Resolved By", type: "reference", to: [{ type: "customerUser" }] }),
    defineField({ name: "resolvedByName", title: "Resolved By Name", type: "string" }),
  ],
  orderings: [
    { title: "Newest first", name: "createdAtDesc", by: [{ field: "createdAt", direction: "desc" }] },
  ],
  preview: {
    select: { title: "productName", subtitle: "requestedByName", status: "status" },
    prepare({ title, subtitle, status }) {
      return {
        title: title || "Restock request",
        subtitle: `${subtitle || "Staff"} · ${status || "open"}`,
      };
    },
  },
});
