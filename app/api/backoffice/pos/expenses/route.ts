import { NextResponse } from "next/server";

import { getApiStaff } from "@/lib/auth/api-authorization";
import { createExpense, listExpenses, type ExpenseInput } from "@/lib/pos/operations";

export const dynamic = "force-dynamic";

export async function GET() {
  const staff = await getApiStaff(["ADMIN", "STORE"]);
  if (!staff.ok) return NextResponse.json({ message: "Unauthorized." }, { status: staff.status });
  try {
    return NextResponse.json({ expenses: await listExpenses() });
  } catch (cause) {
    return NextResponse.json({ message: cause instanceof Error ? cause.message : "Unable to load expenditure." }, { status: 400 });
  }
}

export async function POST(request: Request) {
  const staff = await getApiStaff(["ADMIN", "STORE"]);
  if (!staff.ok) return NextResponse.json({ message: "Unauthorized." }, { status: staff.status });
  try {
    const body = (await request.json()) as ExpenseInput;
    const seller = { id: staff.customerId, name: staff.customerName, email: staff.customerEmail, role: staff.role };
    return NextResponse.json(await createExpense(body, seller));
  } catch (cause) {
    return NextResponse.json({ message: cause instanceof Error ? cause.message : "Unable to record expenditure." }, { status: 400 });
  }
}
