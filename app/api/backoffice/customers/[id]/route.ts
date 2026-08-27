import { NextRequest, NextResponse } from "next/server";

import { getApiStaff } from "@/lib/auth/api-authorization";
import type { CustomerRole, CustomerStatus } from "@/lib/auth/sanity-users";
import { serverClient } from "@/sanity/lib/serverClient";

const roles: CustomerRole[] = ["CUSTOMER", "STORE", "ADMIN"];
const statuses: CustomerStatus[] = ["ACTIVE", "SUSPENDED"];
const clean = (value: unknown) => (typeof value === "string" ? value.trim() : undefined);

export async function PATCH(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  const staff = await getApiStaff(["ADMIN"]);
  if (!staff.ok) return NextResponse.json({ message: "Access denied." }, { status: staff.status });

  const { id } = await context.params;
  const customerId = decodeURIComponent(id).replace(/^drafts\./, "");
  const body = (await request.json()) as Record<string, unknown>;
  const role = clean(body.role) as CustomerRole | undefined;
  const status = clean(body.status) as CustomerStatus | undefined;

  if (role && !roles.includes(role)) return NextResponse.json({ message: "Invalid customer role." }, { status: 400 });
  if (status && !statuses.includes(status)) return NextResponse.json({ message: "Invalid customer status." }, { status: 400 });

  if (customerId === staff.customerId && role && role !== "ADMIN") {
    return NextResponse.json({ message: "You cannot remove your own admin access." }, { status: 400 });
  }
  if (customerId === staff.customerId && status && status !== "ACTIVE") {
    return NextResponse.json({ message: "You cannot suspend your own admin account." }, { status: 400 });
  }

  const existing = await serverClient.fetch<{ _id: string } | null>(
    `*[_type == "customerUser" && _id == $id][0]{_id}`,
    { id: customerId },
  );
  if (!existing) return NextResponse.json({ message: "Customer not found." }, { status: 404 });

  const set: Record<string, unknown> = { updatedAt: new Date().toISOString() };
  for (const key of ["name", "phone", "address1", "address2", "city", "region", "country"] as const) {
    if (key in body) set[key] = clean(body[key]) || "";
  }
  if (role) set.role = role;
  if (status) set.status = status;

  await serverClient.patch(customerId).set(set).commit();
  return NextResponse.json({ ok: true });
}
