import { NextResponse } from "next/server";

import { getApiStaff } from "@/lib/auth/api-authorization";
import { getStaffActivitySummary } from "@/lib/auth/staff-activity";
import { serverClient } from "@/sanity/lib/serverClient";

export const dynamic = "force-dynamic";

const staffRoles = ["STORE_STAFF", "PRODUCTION_STAFF", "PACKAGING_STAFF", "DELIVERY_STAFF", "STORE", "ADMIN"];

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const admin = await getApiStaff(["ADMIN"]);
  if (!admin.ok) return NextResponse.json({ message: "Access denied." }, { status: admin.status });

  const { id } = await params;
  const person = await serverClient.fetch<{ _id: string; role?: string } | null>(
    `*[_type == "customerUser" && _id == $id][0]{_id,role}`,
    { id },
    { cache: "no-store" },
  );
  if (!person || !person.role || !staffRoles.includes(person.role)) {
    return NextResponse.json({ message: "Staff member not found." }, { status: 404 });
  }

  return NextResponse.json(await getStaffActivitySummary(person._id));
}
