import { defineField, defineType } from "sanity";

export const auditEvent = defineType({
  name: "auditEvent",
  title: "Audit Trail",
  type: "document",
  fields: [
    defineField({ name: "eventNumber", title: "Event Number", type: "string", validation: (Rule) => Rule.required() }),
    defineField({ name: "eventType", title: "Event Type", type: "string", validation: (Rule) => Rule.required() }),
    defineField({ name: "entityType", title: "Entity Type", type: "string" }),
    defineField({ name: "entityId", title: "Entity ID", type: "string" }),
    defineField({ name: "entityLabel", title: "Entity Label", type: "string" }),
    defineField({ name: "actor", title: "Actor", type: "reference", to: [{ type: "customerUser" }] }),
    defineField({ name: "actorName", title: "Actor Name", type: "string" }),
    defineField({ name: "actorRole", title: "Actor Role", type: "string" }),
    defineField({ name: "detail", title: "Detail", type: "text", rows: 3 }),
    defineField({ name: "createdAt", title: "Created At", type: "datetime", validation: (Rule) => Rule.required() }),
  ],
  orderings: [{ title: "Newest first", name: "createdAtDesc", by: [{ field: "createdAt", direction: "desc" }] }],
});
