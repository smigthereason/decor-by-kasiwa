import {
  defineArrayMember,
  defineField,
  defineType,
} from "sanity";

export const commerceOrder = defineType({
  name: "commerceOrder",
  title: "Commerce Order",
  type: "document",
  fields: [
    defineField({
      name: "orderNumber",
      title: "Order Number",
      type: "string",
      validation: (Rule) => Rule.required(),
    }),
    defineField({
      name: "customer",
      title: "Customer",
      type: "reference",
      to: [{ type: "customerUser" }],
    }),
    defineField({
      name: "customerName",
      title: "Customer Name",
      type: "string",
      validation: (Rule) => Rule.required(),
    }),
    defineField({
      name: "customerEmail",
      title: "Customer Email",
      type: "string",
      validation: (Rule) => Rule.required().email(),
    }),
    defineField({
      name: "customerPhone",
      title: "Customer Phone",
      type: "string",
    }),
    defineField({
      name: "deliveryLocation",
      title: "Delivery Location",
      type: "string",
    }),
    defineField({
      name: "deliveryAddress",
      title: "Delivery Address Snapshot",
      description:
        "Immutable checkout address captured for this order. Customer profile changes do not alter this order history.",
      type: "object",
      fields: [
        defineField({
          name: "fullName",
          title: "Full Name",
          type: "string",
        }),
        defineField({
          name: "phone",
          title: "Phone",
          type: "string",
        }),
        defineField({
          name: "address1",
          title: "Address line 1",
          type: "string",
        }),
        defineField({
          name: "address2",
          title: "Address line 2",
          type: "string",
        }),
        defineField({
          name: "city",
          title: "City / Town",
          type: "string",
        }),
        defineField({
          name: "region",
          title: "County / Region",
          type: "string",
        }),
        defineField({
          name: "country",
          title: "Country",
          type: "string",
        }),
      ],
    }),
    defineField({
      name: "createdAt",
      title: "Created At",
      type: "datetime",
      validation: (Rule) => Rule.required(),
    }),
    defineField({
      name: "updatedAt",
      title: "Updated At",
      type: "datetime",
    }),
    defineField({
      name: "paidAt",
      title: "Paid At",
      type: "datetime",
    }),
    defineField({
      name: "status",
      title: "Order Status",
      type: "string",
      initialValue: "pending",
      options: {
        list: [
          { title: "Pending", value: "pending" },
          { title: "Paid", value: "paid" },
          { title: "Processing", value: "processing" },
          { title: "Ready for Store", value: "ready_for_store" },
          { title: "Picking", value: "picking" },
          { title: "Packed", value: "packed" },
          { title: "Dispatched", value: "dispatched" },
          { title: "Delivered", value: "delivered" },
          { title: "Cancelled", value: "cancelled" },
        ],
      },
      validation: (Rule) => Rule.required(),
    }),
    defineField({
      name: "paymentStatus",
      title: "Payment Status",
      type: "string",
      initialValue: "pending",
      options: {
        list: [
          { title: "Pending", value: "pending" },
          { title: "Paid", value: "paid" },
          { title: "Refunded", value: "refunded" },
          { title: "Failed", value: "failed" },
        ],
      },
      validation: (Rule) => Rule.required(),
    }),
    defineField({
      name: "subtotal",
      title: "Subtotal",
      type: "number",
      validation: (Rule) => Rule.required().min(0),
    }),
    defineField({
      name: "deliveryFee",
      title: "Delivery Fee",
      type: "number",
      initialValue: 0,
      validation: (Rule) => Rule.min(0),
    }),
    defineField({
      name: "total",
      title: "Total",
      type: "number",
      validation: (Rule) => Rule.required().min(0),
    }),
    defineField({
      name: "currency",
      title: "Currency",
      type: "string",
      initialValue: "KES",
    }),
    defineField({
      name: "assignedStore",
      title: "Assigned Store",
      type: "string",
    }),
    defineField({
      name: "dispatchedAt",
      title: "Dispatched At",
      type: "datetime",
      description: "Set once when an Admin or Store Manager hands this order to delivery staff.",
    }),
    defineField({
      name: "dispatchedBy",
      title: "Dispatched By",
      type: "reference",
      to: [{ type: "customerUser" }],
    }),
    defineField({
      name: "dispatchedByName",
      title: "Dispatched By Name",
      type: "string",
    }),
    defineField({
      name: "deliveredAt",
      title: "Delivered At",
      type: "datetime",
    }),
    defineField({
      name: "deliveredBy",
      title: "Delivery Confirmed By",
      type: "reference",
      to: [{ type: "customerUser" }],
    }),
    defineField({
      name: "deliveredByName",
      title: "Delivery Confirmed By Name",
      type: "string",
    }),
    defineField({
      name: "paymentReference",
      title: "Payment Reference",
      type: "string",
    }),
    defineField({
      name: "paymentProvider",
      title: "Payment Provider",
      type: "string",
    }),
    defineField({
      name: "paymentChannel",
      title: "Payment Channel",
      type: "string",
    }),
    defineField({
      name: "paystackTransactionId",
      title: "Paystack Transaction ID",
      type: "string",
    }),
    defineField({
      name: "failureReason",
      title: "Payment / Processing Note",
      type: "text",
      rows: 3,
    }),
    defineField({
      name: "lineItems",
      title: "Line Items",
      type: "array",
      of: [
        defineArrayMember({
          type: "object",
          fields: [
            defineField({
              name: "product",
              title: "Product",
              type: "reference",
              to: [{ type: "product" }],
            }),
            defineField({
              name: "productId",
              title: "Product ID",
              type: "string",
            }),
            defineField({
              name: "name",
              title: "Product Name",
              type: "string",
              validation: (Rule) => Rule.required(),
            }),
            defineField({
              name: "category",
              title: "Category",
              type: "string",
            }),
            defineField({
              name: "finish",
              title: "Finish",
              type: "string",
            }),
            defineField({
              name: "quantity",
              title: "Quantity",
              type: "number",
              validation: (Rule) => Rule.required().min(1),
            }),
            defineField({
              name: "unitPrice",
              title: "Unit Price",
              type: "number",
              validation: (Rule) => Rule.required().min(0),
            }),
          ],
          preview: {
            select: {
              title: "name",
              quantity: "quantity",
              price: "unitPrice",
            },
            prepare({ title, quantity, price }) {
              return {
                title: `${quantity || 0} × ${title || "Item"}`,
                subtitle: `KES ${Number(price || 0).toLocaleString("en-KE")}`,
              };
            },
          },
        }),
      ],
      validation: (Rule) => Rule.required().min(1),
    }),
  ],
  orderings: [
    {
      title: "Newest first",
      name: "createdAtDesc",
      by: [{ field: "createdAt", direction: "desc" }],
    },
  ],
  preview: {
    select: {
      title: "orderNumber",
      customer: "customerName",
      status: "status",
      total: "total",
    },
    prepare({ title, customer, status, total }) {
      return {
        title: title || "Order",
        subtitle: `${customer || "Customer"} · ${status || "pending"} · KES ${Number(
          total || 0,
        ).toLocaleString("en-KE")}`,
      };
    },
  },
});
