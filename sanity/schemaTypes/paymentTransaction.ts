import { defineField, defineType } from "sanity";

export const paymentTransaction = defineType({
  name: "paymentTransaction",
  title: "Payment Transaction",
  type: "document",
  fields: [
    defineField({ name: "reference", title: "Reference", type: "string", validation: (Rule) => Rule.required() }),
    defineField({ name: "order", title: "Order", type: "reference", to: [{ type: "commerceOrder" }] }),
    defineField({ name: "orderNumber", title: "Order Number", type: "string" }),
    defineField({ name: "customer", title: "Customer", type: "reference", to: [{ type: "customerUser" }] }),
    defineField({ name: "customerName", title: "Customer Name", type: "string" }),
    defineField({ name: "customerPhone", title: "Customer Phone", type: "string" }),
    defineField({ name: "salesChannel", title: "Sales Channel", type: "string", options: { list: [
      { title: "Online", value: "ONLINE" }, { title: "Point of Sale", value: "POS" },
    ] } }),
    defineField({ name: "provider", title: "Provider", type: "string" }),
    defineField({ name: "channel", title: "Payment Channel", type: "string" }),
    defineField({ name: "status", title: "Status", type: "string", validation: (Rule) => Rule.required(), options: { list: [
      { title: "Pending", value: "pending" },
      { title: "Paid", value: "paid" },
      { title: "Partially Paid", value: "partially_paid" },
      { title: "Failed", value: "failed" },
      { title: "Timed Out / Needs Review", value: "timed_out" },
      { title: "Refunded", value: "refunded" },
    ] } }),
    defineField({ name: "amount", title: "Amount", type: "number", validation: (Rule) => Rule.required().min(0) }),
    defineField({ name: "currency", title: "Currency", type: "string", initialValue: "KES" }),
    defineField({ name: "providerTransactionId", title: "Provider Transaction ID", type: "string" }),
    defineField({ name: "providerReceiptNumber", title: "Provider / M-PESA Receipt Reference", type: "string" }),
    defineField({ name: "failureReason", title: "Failure Reason", type: "text", rows: 3 }),
    defineField({ name: "processedBy", title: "Processed By", type: "reference", to: [{ type: "customerUser" }] }),
    defineField({ name: "processedByName", title: "Processed By Name", type: "string" }),
    defineField({ name: "processedByRole", title: "Processed By Role", type: "string" }),
    defineField({ name: "createdAt", title: "Created At", type: "datetime", validation: (Rule) => Rule.required() }),
    defineField({ name: "updatedAt", title: "Updated At", type: "datetime" }),
    defineField({ name: "paidAt", title: "Paid At", type: "datetime" }),
    defineField({ name: "refundedAt", title: "Refunded At", type: "datetime" }),
  ],
  orderings: [{ title: "Newest first", name: "createdAtDesc", by: [{ field: "createdAt", direction: "desc" }] }],
  preview: {
    select: { title: "reference", order: "orderNumber", status: "status", amount: "amount", channel: "channel" },
    prepare({ title, order, status, amount, channel }) {
      return { title: title || order || "Payment", subtitle: `${status || "pending"} · ${channel || "payment"} · KES ${Number(amount || 0).toLocaleString("en-KE")}` };
    },
  },
});
