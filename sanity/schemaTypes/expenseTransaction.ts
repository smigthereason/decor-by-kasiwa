import { defineField, defineType } from "sanity";

export const expenseTransaction = defineType({
  name: "expenseTransaction",
  title: "Expenditure / Petty Cash",
  type: "document",
  fields: [
    defineField({ name: "expenseNumber", title: "Expense Number", type: "string", validation: (Rule) => Rule.required() }),
    defineField({ name: "expenseType", title: "Type", type: "string", validation: (Rule) => Rule.required(), options: { list: [
      { title: "Business Expense", value: "EXPENSE" }, { title: "Petty Cash", value: "PETTY_CASH" }, { title: "Staff Payment", value: "STAFF_PAYMENT" }, { title: "Salary", value: "SALARY" },
    ] } }),
    defineField({ name: "staffName", title: "Staff / Payee Name", type: "string" }),
    defineField({ name: "description", title: "Description", type: "text", rows: 3, validation: (Rule) => Rule.required() }),
    defineField({ name: "amount", title: "Amount", type: "number", validation: (Rule) => Rule.required().min(0.01) }),
    defineField({ name: "currency", title: "Currency", type: "string", initialValue: "KES" }),
    defineField({ name: "paymentMethod", title: "Payment Method", type: "string", options: { list: [
      { title: "Cash", value: "cash" }, { title: "M-PESA", value: "mpesa" }, { title: "Bank / Paystack", value: "paystack" }, { title: "Other", value: "other" },
    ] } }),
    defineField({ name: "transactionReference", title: "Transaction Reference", type: "string" }),
    defineField({ name: "expenseDate", title: "Expense Date", type: "datetime", validation: (Rule) => Rule.required() }),
    defineField({ name: "createdBy", title: "Created By", type: "reference", to: [{ type: "customerUser" }] }),
    defineField({ name: "createdByName", title: "Created By Name", type: "string" }),
    defineField({ name: "createdByRole", title: "Created By Role", type: "string" }),
    defineField({ name: "createdAt", title: "Created At", type: "datetime", validation: (Rule) => Rule.required() }),
  ],
  orderings: [{ title: "Newest first", name: "createdAtDesc", by: [{ field: "expenseDate", direction: "desc" }] }],
});
