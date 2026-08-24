import { defineField, defineType } from "sanity";

export const consultation = defineType({
  name: "consultation",
  title: "Consultation Enquiries",
  type: "document",
  fields: [
    defineField({ name: "name", title: "Client name", type: "string" }),
    defineField({ name: "email", title: "Email", type: "string" }),
    defineField({ name: "phone", title: "Phone", type: "string" }),
    defineField({ name: "projectType", title: "Project type", type: "string" }),
    defineField({ name: "spaceType", title: "Space type", type: "string" }),
    defineField({ name: "location", title: "Location", type: "string" }),
    defineField({ name: "budget", title: "Budget", type: "string" }),
    defineField({ name: "timeline", title: "Timeline", type: "string" }),
    defineField({ name: "inspiration", title: "Inspiration / notes", type: "text", rows: 6 }),
    defineField({
      name: "status",
      title: "Status",
      type: "string",
      initialValue: "new",
      options: { list: ["new", "contacted", "qualified", "proposal", "won", "closed"] }
    })
  ],
});
