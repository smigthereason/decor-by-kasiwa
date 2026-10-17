import { defineField, defineType } from "sanity";

export const tillReceipt = defineType({
  name: "tillReceipt", title: "External Till Receipt", type: "document",
  fields: [
    defineField({ name: "receipt", title: "M-Pesa receipt", type: "string", validation: Rule => Rule.required() }),
    defineField({ name: "amount", title: "Amount (KES)", type: "number", validation: Rule => Rule.required().positive() }),
    defineField({ name: "payer", title: "Payer (optional)", type: "string" }),
    defineField({ name: "paidAt", title: "Payment time", type: "datetime" }),
    defineField({ name: "source", title: "Source", type: "string" }),
    defineField({ name: "status", title: "Reconciliation state", type: "string", options: {list:[{title:"Unmatched",value:"unmatched"},{title:"Matched",value:"matched"},{title:"Reconciled",value:"reconciled"}]} }),
    defineField({ name: "verificationStatus", title: "Provider evidence", type: "string", options: {list:[{title:"Unverified",value:"unverified"},{title:"Provider evidence reviewed",value:"evidence_reviewed"}]} }),
    defineField({ name: "evidenceReference", title: "Evidence / statement reference", type: "string" }),
    defineField({ name: "order", title: "Matched order", type: "reference", to:[{type:"commerceOrder"}] }),
    defineField({ name: "storeLocation", title: "Attributed store", type: "reference", to:[{type:"storeLocation"}] }),
    defineField({ name: "notes", title: "Notes", type: "text" }),
    defineField({ name: "createdAt", title: "Created", type: "datetime" }),
    defineField({ name: "updatedAt", title: "Updated", type: "datetime" }),
    defineField({ name: "processedBy", title: "Recorded by", type: "reference", to:[{type:"customerUser"}] }),
  ],
  preview: { select:{ title:"receipt",status:"status",amount:"amount" }, prepare({title,status,amount}) {return {title,subtitle:`${status || "unmatched"} · KES ${amount || 0}`};} },
});
