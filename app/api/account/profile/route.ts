import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";

import { authOptions } from "@/lib/auth/options";
import { getCustomerByDocumentId } from "@/lib/auth/sanity-users";
import { serverClient } from "@/sanity/lib/serverClient";

const clean = (value: unknown) => (typeof value === "string" ? value.trim() : "");

async function currentCustomer() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) return null;
  return getCustomerByDocumentId(session.user.id);
}

export async function GET() {
  const customer = await currentCustomer();
  if (!customer) return NextResponse.json({ message: "Authentication required." }, { status: 401 });
  return NextResponse.json({
    name: customer.name,
    email: customer.email,
    phone: customer.phone || "",
    address1: customer.address1 || "",
    address2: customer.address2 || "",
    city: customer.city || "",
    region: customer.region || "",
    country: customer.country || "Kenya",
  });
}

export async function PATCH(request: NextRequest) {
  const customer = await currentCustomer();
  if (!customer) return NextResponse.json({ message: "Authentication required." }, { status: 401 });
  if (customer.status !== "ACTIVE") return NextResponse.json({ message: "Account is suspended." }, { status: 403 });

  const body = (await request.json()) as Record<string, unknown>;
  const set: Record<string, unknown> = { updatedAt: new Date().toISOString() };
  for (const key of ["name", "phone", "address1", "address2", "city", "region", "country"] as const) {
    if (key in body) set[key] = clean(body[key]);
  }
  await serverClient.patch(customer._id.replace(/^drafts\./, "")).set(set).commit();
  return NextResponse.json({ ok: true });
}
