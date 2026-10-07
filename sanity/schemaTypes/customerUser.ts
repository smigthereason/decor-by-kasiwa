import { defineField, defineType } from "sanity";

export const customerUser = defineType({
  name: "customerUser",
  title: "Customers",
  type: "document",
  fields: [
    defineField({ name: "name", title: "Name", type: "string", validation: (Rule) => Rule.required() }),
    defineField({ name: "email", title: "Email", type: "string", validation: (Rule) => Rule.email(), description: "Optional for in-store/POS customers; required for Google-authenticated staff and online checkout customers." }),
    defineField({ name: "phone", title: "Phone", type: "string", description: "Best contact number collected from account details or checkout." }),
    defineField({ name: "image", title: "Google profile image URL", type: "url" }),
    defineField({ name: "googleId", title: "Google account ID", type: "string", description: "Empty for guest purchasers until they sign in with Google." }),
    defineField({
      name: "source", title: "Customer source", type: "string", initialValue: "GOOGLE",
      options: { list: [
        { title: "Google account", value: "GOOGLE" },
        { title: "Email & password account", value: "EMAIL_PASSWORD" },
        { title: "Guest checkout", value: "GUEST_CHECKOUT" },
        { title: "Created by admin", value: "ADMIN" },
        { title: "Point of Sale", value: "POS" },
      ] },
    }),
    defineField({
      name: "role", title: "Role", type: "string", initialValue: "CUSTOMER",
      options: { list: [
        { title: "Customer", value: "CUSTOMER" },
        { title: "Sales Staff / Cashier", value: "STORE_STAFF" },
        { title: "Production Staff", value: "PRODUCTION_STAFF" },
        { title: "Packaging Staff", value: "PACKAGING_STAFF" },
        { title: "Delivery Staff", value: "DELIVERY_STAFF" },
        { title: "Store Manager", value: "STORE" },
        { title: "Admin / Store Owner", value: "ADMIN" },
      ], layout: "radio" }, validation: (Rule) => Rule.required(),
    }),
    defineField({
      name: "permissions", title: "Operational permissions", type: "array", of: [{ type: "string" }],
      description: "Fine-grained responsibilities for staff members who work across more than one operational area.",
      options: { list: [
        { title: "POS Sales", value: "POS_SALES" },
        { title: "WhatsApp Sales", value: "WHATSAPP_SALES" },
        { title: "TikTok Sales", value: "TIKTOK_SALES" },
        { title: "Ground Sales", value: "GROUND_SALES" },
        { title: "Production", value: "PRODUCTION" },
        { title: "Printing", value: "PRINTING" },
        { title: "Packaging", value: "PACKAGING" },
        { title: "Delivery", value: "DELIVERY" },
      ] },
    }),
    defineField({
      name: "status", title: "Status", type: "string", initialValue: "ACTIVE",
      options: { list: [
        { title: "Active", value: "ACTIVE" },
        { title: "Suspended", value: "SUSPENDED" },
      ], layout: "radio" }, validation: (Rule) => Rule.required(),
    }),
    defineField({ name: "address1", title: "Address line 1", type: "string" }),
    defineField({ name: "address2", title: "Address line 2", type: "string" }),
    defineField({ name: "city", title: "City / Town", type: "string" }),
    defineField({ name: "region", title: "County / Region", type: "string" }),
    defineField({ name: "country", title: "Country", type: "string", initialValue: "Kenya" }),
    defineField({ name: "firstPurchaseAt", title: "First purchase", type: "datetime", readOnly: true }),
    defineField({ name: "lastPurchaseAt", title: "Last purchase", type: "datetime", readOnly: true }),
    defineField({ name: "outstandingBalance", title: "Outstanding Balance (KES)", type: "number", initialValue: 0, readOnly: true }),
    defineField({ name: "lastPosPurchaseAt", title: "Last POS purchase", type: "datetime", readOnly: true }),
    defineField({
      name: "recentlyViewedProducts",
      title: "Recently viewed products",
      type: "array",
      readOnly: true,
      description: "Recent product interest captured from authenticated customer browsing.",
      of: [{
        type: "object",
        fields: [
          defineField({ name: "product", title: "Product", type: "reference", to: [{ type: "product" }] }),
          defineField({ name: "viewedAt", title: "Viewed at", type: "datetime" }),
          defineField({ name: "nameSnapshot", title: "Product name snapshot", type: "string", hidden: true }),
          defineField({ name: "slugSnapshot", title: "Product slug snapshot", type: "string", hidden: true }),
          defineField({ name: "imageUrlSnapshot", title: "Image URL snapshot", type: "string", hidden: true }),
        ],
        preview: {
          select: { title: "nameSnapshot", subtitle: "viewedAt" },
          prepare({ title, subtitle }) { return { title: title || "Product", subtitle: subtitle || "Viewed" }; },
        },
      }],
    }),
    defineField({ name: "lastProductViewAt", title: "Last product view", type: "datetime", readOnly: true }),
    defineField({ name: "createdAt", title: "Created at", type: "datetime", readOnly: true }),
    defineField({ name: "passwordHash", title: "Password hash", type: "string", hidden: true, readOnly: true }),
    defineField({ name: "passwordUpdatedAt", title: "Password updated at", type: "datetime", hidden: true, readOnly: true }),
    defineField({ name: "passwordResetTokenHash", title: "Password reset token hash", type: "string", hidden: true, readOnly: true }),
    defineField({ name: "passwordResetExpiresAt", title: "Password reset expires at", type: "datetime", hidden: true, readOnly: true }),
    defineField({ name: "lastLoginAt", title: "Last login", type: "datetime", readOnly: true }),
    defineField({ name: "updatedAt", title: "Updated at", type: "datetime", readOnly: true }),
  ],
  preview: {
    select: { title: "name", subtitle: "email", role: "role", status: "status" },
    prepare({ title, subtitle, role, status }) {
      return { title: title || "Customer", subtitle: `${subtitle || "No email"} · ${role || "CUSTOMER"} · ${status || "ACTIVE"}` };
    },
  },
});
