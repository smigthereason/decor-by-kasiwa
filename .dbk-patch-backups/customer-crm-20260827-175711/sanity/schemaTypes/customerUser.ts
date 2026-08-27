import { defineField, defineType } from "sanity";

export const customerUser = defineType({
  name: "customerUser",
  title: "Customer",
  type: "document",

  fields: [
    defineField({
      name: "name",
      title: "Name",
      type: "string",
      readOnly: true,
    }),

    defineField({
      name: "email",
      title: "Email",
      type: "string",
      readOnly: true,
      validation: (Rule) => Rule.required().email(),
    }),

    defineField({
      name: "googleId",
      title: "Google ID",
      type: "string",
      readOnly: true,
      hidden: true,
    }),

    defineField({
      name: "image",
      title: "Google Profile Image",
      type: "url",
      readOnly: true,
    }),

    // Editable for staff testing and access control
    defineField({
      name: "role",
      title: "Role",
      type: "string",
      initialValue: "CUSTOMER",
      options: {
        list: [
          {
            title: "Customer",
            value: "CUSTOMER",
          },
          {
            title: "Admin",
            value: "ADMIN",
          },
          {
            title: "Store",
            value: "STORE",
          },
        ],
        layout: "radio",
      },
      validation: (Rule) => Rule.required(),
    }),

    // Editable so access can be suspended/restored in Studio
    defineField({
      name: "status",
      title: "Status",
      type: "string",
      initialValue: "ACTIVE",
      options: {
        list: [
          {
            title: "Active",
            value: "ACTIVE",
          },
          {
            title: "Suspended",
            value: "SUSPENDED",
          },
        ],
        layout: "radio",
      },
      validation: (Rule) => Rule.required(),
    }),

    defineField({
      name: "createdAt",
      title: "Created At",
      type: "datetime",
      readOnly: true,
    }),

    defineField({
      name: "lastLoginAt",
      title: "Last Login",
      type: "datetime",
      readOnly: true,
    }),

    defineField({
      name: "updatedAt",
      title: "Updated At",
      type: "datetime",
      readOnly: true,
    }),
  ],

  preview: {
    select: {
      title: "name",
      email: "email",
      role: "role",
      status: "status",
    },

    prepare({
      title,
      email,
      role,
      status,
    }) {
      return {
        title:
          title ||
          email ||
          "Customer",

        subtitle: `${
          role || "CUSTOMER"
        } · ${
          status || "ACTIVE"
        } · ${email || ""}`,
      };
    },
  },
});
