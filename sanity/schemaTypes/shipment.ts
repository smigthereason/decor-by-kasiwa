import { defineField, defineType } from "sanity";

export const shipment = defineType({
  name: "shipment",
  title: "Shipment",
  type: "document",
  fields: [
    defineField({ name: "shipmentNumber", title: "Shipment Number", type: "string", validation: (Rule) => Rule.required() }),
    defineField({ name: "order", title: "Order", type: "reference", to: [{ type: "commerceOrder" }], validation: (Rule) => Rule.required() }),
    defineField({ name: "orderNumber", title: "Order Number", type: "string" }),
    defineField({ name: "customerName", title: "Customer Name", type: "string" }),
    defineField({ name: "destination", title: "Destination", type: "string" }),
    defineField({ name: "carrier", title: "Carrier", type: "string" }),
    defineField({ name: "trackingNumber", title: "Tracking Number", type: "string" }),
    defineField({ name: "createdAt", title: "Created At", type: "datetime", validation: (Rule) => Rule.required() }),
    defineField({ name: "updatedAt", title: "Updated At", type: "datetime" }),
    defineField({
      name: "status",
      title: "Shipment Status",
      type: "string",
      initialValue: "awaiting_store",
      options: {
        list: [
          { title: "Awaiting Store", value: "awaiting_store" },
          { title: "Received", value: "received" },
          { title: "Picking", value: "picking" },
          { title: "Packed", value: "packed" },
          { title: "Ready to Dispatch", value: "ready_dispatch" },
          { title: "Dispatched", value: "dispatched" },
          { title: "Delivered", value: "delivered" },
          { title: "Exception", value: "exception" },
        ],
      },
      validation: (Rule) => Rule.required(),
    }),
    defineField({ name: "itemCount", title: "Line Item Count", type: "number", initialValue: 0, validation: (Rule) => Rule.min(0) }),
    defineField({ name: "totalUnits", title: "Total Units", type: "number", initialValue: 0, validation: (Rule) => Rule.min(0) }),
    defineField({ name: "notes", title: "Notes", type: "text", rows: 3 }),
  ],
  orderings: [{ title: "Recently updated", name: "updatedAtDesc", by: [{ field: "updatedAt", direction: "desc" }] }],
  preview: {
    select: { title: "shipmentNumber", order: "orderNumber", customer: "customerName", status: "status" },
    prepare({ title, order, customer, status }) {
      return { title: title || "Shipment", subtitle: `${order || "Order"} · ${customer || "Customer"} · ${status || "awaiting_store"}` };
    },
  },
});
