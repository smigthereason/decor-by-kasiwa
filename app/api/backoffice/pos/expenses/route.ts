import { NextResponse } from "next/server";

import { getApiStaff } from "@/lib/auth/api-authorization";
import { createExpense, listExpenses, type ExpenseInput } from "@/lib/pos/operations";
import { expenseBackendIsNeon } from "@/lib/db/expenses-neon";

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
    const message = cause instanceof Error ? cause.message : "Unable to record expenditure.";
    if (expenseBackendIsNeon() && !/^(Only Admin|Expense description|Enter a valid|Select a valid|Ledger account|Manager expenditure|Refresh the Expenditure|This submission key)/.test(message)) {
      // Do not expose database connection details through API responses.
      console.error("[DBK-45] Expenditure backend error", cause);
      return NextResponse.json({ message: "Unable to verify expenditure. Check history before retrying." }, { status: 503 });
    }
    return NextResponse.json({ message }, { status: 400 });
  }
}
