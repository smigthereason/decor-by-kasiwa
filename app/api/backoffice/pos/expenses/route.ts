import { NextResponse } from "next/server";

import { getApiStaff } from "@/lib/auth/api-authorization";
import { createExpense, listExpenses, type ExpenseInput } from "@/lib/pos/operations";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const staff = await getApiStaff(["ADMIN", "STORE", "MANAGER", "STORE_STAFF"]);
  if (!staff.ok) return NextResponse.json({ message: "Unauthorized." }, { status: staff.status });
  try {
    const requestedStoreId = new URL(request.url).searchParams.get("store")?.trim() || undefined;
    const storeId = staff.role === "MANAGER" || staff.role === "STORE_STAFF" ? staff.storeLocationId : requestedStoreId;
    return NextResponse.json({ expenses: await listExpenses(150, storeId) });
  } catch (cause) {
    return NextResponse.json({ message: cause instanceof Error ? cause.message : "Unable to load expenditure." }, { status: 400 });
  }
}

export async function POST(request: Request) {
  const staff = await getApiStaff(["ADMIN", "STORE", "MANAGER", "STORE_STAFF"]);
  if (!staff.ok) return NextResponse.json({ message: "Unauthorized." }, { status: staff.status });
  try {
    const body = (await request.json()) as ExpenseInput;
    const seller = { id: staff.customerId, name: staff.customerName, email: staff.customerEmail, role: staff.role, storeLocationId: staff.storeLocationId, storeLocationName: staff.storeLocationName, storeLocationCode: staff.storeLocationCode };
    return NextResponse.json(await createExpense(body, seller));
  } catch (cause) {
    return NextResponse.json({ message: cause instanceof Error ? cause.message : "Unable to record expenditure." }, { status: 400 });
  }
}
