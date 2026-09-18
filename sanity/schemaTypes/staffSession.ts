import { defineField, defineType } from "sanity";

export const staffSession = defineType({
  name: "staffSession",
  title: "Staff Sessions",
  type: "document",
  fields: [
    defineField({ name: "staff", title: "Staff member", type: "reference", to: [{ type: "customerUser" }], validation: (Rule) => Rule.required() }),
    defineField({ name: "staffName", title: "Staff name", type: "string" }),
    defineField({ name: "staffEmail", title: "Staff email", type: "string" }),
    defineField({ name: "staffRole", title: "Staff role", type: "string" }),
    defineField({ name: "sessionKey", title: "Session key", type: "string", hidden: true, readOnly: true }),
    defineField({ name: "loginAt", title: "Login time", type: "datetime", validation: (Rule) => Rule.required(), readOnly: true }),
    defineField({ name: "lastSeenAt", title: "Last activity", type: "datetime", validation: (Rule) => Rule.required(), readOnly: true }),
    defineField({ name: "logoutAt", title: "Logout time", type: "datetime", readOnly: true }),
    defineField({ name: "durationMinutes", title: "Active online minutes", type: "number", readOnly: true }),
    defineField({ name: "status", title: "Session status", type: "string", options: { list: [
      { title: "Active", value: "ACTIVE" },
      { title: "Ended", value: "ENDED" },
    ] }, readOnly: true }),
    defineField({ name: "lastRoute", title: "Last page", type: "string", readOnly: true }),
    defineField({ name: "createdAt", title: "Created at", type: "datetime", readOnly: true }),
  ],
  orderings: [{ title: "Latest login", name: "loginAtDesc", by: [{ field: "loginAt", direction: "desc" }] }],
  preview: {
    select: { title: "staffName", subtitle: "staffEmail", loginAt: "loginAt", status: "status" },
    prepare({ title, subtitle, loginAt, status }) {
      return { title: title || "Staff session", subtitle: `${subtitle || "No email"} · ${status || "ACTIVE"} · ${loginAt || ""}` };
    },
  },
});
