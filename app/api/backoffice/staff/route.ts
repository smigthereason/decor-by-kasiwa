import { createHash } from "node:crypto";

import { NextResponse } from "next/server";

import { getApiStaff } from "@/lib/auth/api-authorization";
import type { CustomerRole, StaffPermission } from "@/lib/auth/sanity-users";
import { serverClient } from "@/sanity/lib/serverClient";

export const dynamic = "force-dynamic";

const staffRoles: CustomerRole[] = ["STORE_STAFF", "PRODUCTION_STAFF", "PACKAGING_STAFF", "DELIVERY_STAFF", "MANAGER", "STORE", "ADMIN"];
const permissionValues: StaffPermission[] = ["POS_SALES", "WHATSAPP_SALES", "TIKTOK_SALES", "GROUND_SALES", "PRODUCTION", "PRINTING", "PACKAGING", "DELIVERY"];

type StaffInput = { name?: string; email?: string; role?: CustomerRole; permissions?: StaffPermission[]; assignedStoreId?: string; status?: "ACTIVE" | "SUSPENDED" };
function emailId(email: string) { return `customerUser.staff.${createHash("sha256").update(email).digest("hex").slice(0, 32)}`; }
function normalizePermissions(value: unknown): StaffPermission[] { return Array.isArray(value) ? permissionValues.filter((permission) => value.includes(permission)) : []; }

async function listStaff() {
  return serverClient.fetch(
    `*[_type == "customerUser" && role in $roles] | order(name asc) {
      _id, name, email, role, permissions, "assignedStore": assignedStore->{_id,name,code,"active":coalesce(active,true)}, status, source, lastLoginAt, createdAt, updatedAt
    }`,
    { roles: staffRoles },
    { cache: "no-store" },
  );
}

export async function GET() {
  const staff = await getApiStaff(["ADMIN"]);
  if (!staff.ok) return NextResponse.json({ message: "Access denied." }, { status: staff.status });
  return NextResponse.json({ staff: await listStaff() });
}

export async function POST(request: Request) {
  const admin = await getApiStaff(["ADMIN"]);
  if (!admin.ok) return NextResponse.json({ message: "Access denied." }, { status: admin.status });
  try {
    const body = await request.json() as StaffInput;
    const name = body.name?.trim() || "";
    const email = body.email?.trim().toLowerCase() || "";
    const role = body.role && staffRoles.includes(body.role) ? body.role : "STORE_STAFF";
    const assignedStoreId = typeof body.assignedStoreId === "string" ? body.assignedStoreId.trim() : "";
    if (role === "MANAGER" && !assignedStoreId) return NextResponse.json({ message: "Manager must be assigned to a store/location." }, { status: 400 });
    if (assignedStoreId) { const store = await serverClient.fetch<{_id:string}|null>(`*[_type == "storeLocation" && _id == $id && active != false][0]{_id}`, { id: assignedStoreId }, { cache: "no-store" }); if (!store) return NextResponse.json({ message: "Select an active store/location." }, { status: 400 }); }
    if (name.length < 2) return NextResponse.json({ message: "Staff name is required." }, { status: 400 });
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return NextResponse.json({ message: "Enter a valid staff email." }, { status: 400 });

    const existing = await serverClient.fetch<{ _id: string } | null>(`*[_type == "customerUser" && lower(email) == $email][0]{_id}`, { email });
    if (existing) return NextResponse.json({ message: "That email already has an account. Edit the existing staff/customer record instead." }, { status: 409 });
    const now = new Date().toISOString();
    await serverClient.create({
      _id: emailId(email), _type: "customerUser", name, email, role,
      permissions: normalizePermissions(body.permissions), ...(assignedStoreId ? { assignedStore: { _type: "reference", _ref: assignedStoreId } } : {}), status: body.status === "SUSPENDED" ? "SUSPENDED" : "ACTIVE",
      source: "ADMIN", createdAt: now, updatedAt: now,
    });
    return NextResponse.json({ staff: await listStaff() }, { status: 201 });
  } catch (cause) {
    console.error("Staff create failed:", cause);
    return NextResponse.json({ message: cause instanceof Error ? cause.message : "Unable to create staff member." }, { status: 400 });
  }
}
