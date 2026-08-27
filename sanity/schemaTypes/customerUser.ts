import { defineField, defineType } from "sanity";

export const customerUser = defineType({
  name: "customerUser",
  title: "Customers",
  type: "document",
  fields: [
    defineField({ name: "name", title: "Name", type: "string", validation: (Rule) => Rule.required() }),
    defineField({ name: "email", title: "Email", type: "string", validation: (Rule) => Rule.required().email() }),
    defineField({ name: "phone", title: "Phone", type: "string", description: "Best contact number collected from account details or checkout." }),
    defineField({ name: "image", title: "Google profile image URL", type: "url" }),
    defineField({ name: "googleId", title: "Google account ID", type: "string", description: "Empty for guest purchasers until they sign in with Google." }),
    defineField({
      name: "source", title: "Customer source", type: "string", initialValue: "GOOGLE",
      options: { list: [
        { title: "Google account", value: "GOOGLE" },
        { title: "Guest checkout", value: "GUEST_CHECKOUT" },
        { title: "Created by admin", value: "ADMIN" },
      ] },
    }),
    defineField({
      name: "role", title: "Role", type: "string", initialValue: "CUSTOMER",
      options: { list: [
        { title: "Customer", value: "CUSTOMER" },
        { title: "Store", value: "STORE" },
        { title: "Admin", value: "ADMIN" },
      ], layout: "radio" }, validation: (Rule) => Rule.required(),
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
    defineField({ name: "createdAt", title: "Created at", type: "datetime", readOnly: true }),
    defineField({ name: "lastLoginAt", title: "Last Google login", type: "datetime", readOnly: true }),
    defineField({ name: "updatedAt", title: "Updated at", type: "datetime", readOnly: true }),
  ],
  preview: {
    select: { title: "name", subtitle: "email", role: "role", status: "status" },
    prepare({ title, subtitle, role, status }) {
      return { title: title || "Customer", subtitle: `${subtitle || "No email"} · ${role || "CUSTOMER"} · ${status || "ACTIVE"}` };
    },
  },
});
