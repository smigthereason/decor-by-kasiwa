import { NextResponse } from "next/server";

import { getApiStaff } from "@/lib/auth/api-authorization";
import type { CustomerRole, StaffPermission } from "@/lib/auth/sanity-users";
import { serverClient } from "@/sanity/lib/serverClient";

const staffRoles: CustomerRole[] = ["STORE_STAFF", "PRODUCTION_STAFF", "PACKAGING_STAFF", "DELIVERY_STAFF", "STORE", "ADMIN"];
const permissionValues: StaffPermission[] = ["POS_SALES", "WHATSAPP_SALES", "TIKTOK_SALES", "GROUND_SALES", "PRODUCTION", "PRINTING", "PACKAGING", "DELIVERY"];

type StaffInput = { name?: string; email?: string; role?: CustomerRole; permissions?: StaffPermission[]; status?: "ACTIVE" | "SUSPENDED" };
function normalizePermissions(value: unknown): StaffPermission[] { return Array.isArray(value) ? permissionValues.filter((permission) => value.includes(permission)) : []; }

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const admin = await getApiStaff(["ADMIN"]);
  if (!admin.ok) return NextResponse.json({ message: "Access denied." }, { status: admin.status });
  try {
    const { id } = await params;
    const body = await request.json() as StaffInput;
    const role = body.role && staffRoles.includes(body.role) ? body.role : undefined;
    const name = body.name?.trim();
    const email = body.email?.trim().toLowerCase();
    if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new Error("Enter a valid staff email.");
    if (email) {
      const duplicate = await serverClient.fetch<{ _id: string } | null>(`*[_type == "customerUser" && _id != $id && lower(email) == $email][0]{_id}`, { id, email });
      if (duplicate) return NextResponse.json({ message: "That email belongs to another account." }, { status: 409 });
    }
    const set: Record<string, unknown> = { updatedAt: new Date().toISOString() };
    if (name) set.name = name;
    if (email) set.email = email;
    if (role) set.role = role;
    if (body.permissions) set.permissions = normalizePermissions(body.permissions);
    if (body.status) set.status = body.status;
    await serverClient.patch(id).set(set).commit();
    return NextResponse.json({ ok: true });
  } catch (cause) {
    console.error("Staff update failed:", cause);
    return NextResponse.json({ message: cause instanceof Error ? cause.message : "Unable to update staff member." }, { status: 400 });
  }
}
