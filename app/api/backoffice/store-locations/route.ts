import { randomUUID } from "node:crypto";

import { NextResponse } from "next/server";

import { getApiStaff } from "@/lib/auth/api-authorization";
import { serverClient } from "@/sanity/lib/serverClient";

export const dynamic = "force-dynamic";

type StoreInput = { name?: string; code?: string; address?: string; locationType?: string; active?: boolean };

function clean(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function normalizeCode(value: string) {
  return value.toUpperCase().replace(/[^A-Z0-9]+/g, "-").replace(/^-+|-+$/g, "");
}

function normalizeLocationType(value: unknown) {
  return value === "MAIN" || value === "BRANCH" ? value : "";
}

async function listLocations(includeInactive = false) {
  return serverClient.fetch(
    `*[_type == "storeLocation" ${includeInactive ? "" : "&& active != false"}] | order(name asc){_id,name,code,address,locationType,"active":coalesce(active,true),createdAt,updatedAt}`,
    {},
    { cache: "no-store" },
  );
}

export async function GET() {
  const staff = await getApiStaff(["ADMIN", "STORE", "MANAGER", "STORE_STAFF"]);
  if (!staff.ok) return NextResponse.json({ message: "Access denied." }, { status: staff.status });
  return NextResponse.json({
    locations: await listLocations(staff.role === "ADMIN"),
    assignedStoreId: staff.storeLocationId || "",
    assignedStoreName: staff.storeLocationName || "",
  });
}

export async function POST(request: Request) {
  const staff = await getApiStaff(["ADMIN"]);
  if (!staff.ok) return NextResponse.json({ message: "Access denied." }, { status: staff.status });
  try {
    const body = (await request.json()) as StoreInput;
    const name = clean(body.name);
    const code = normalizeCode(clean(body.code || name));
    const address = clean(body.address);
    const locationType = normalizeLocationType(body.locationType);
    if (name.length < 2) return NextResponse.json({ message: "Store name is required." }, { status: 400 });
    if (code.length < 2) return NextResponse.json({ message: "Store code is required." }, { status: 400 });
    if (!locationType) return NextResponse.json({ message: "Select whether this location is Main or Branch." }, { status: 400 });
    const duplicate = await serverClient.fetch<{ _id: string } | null>(
      `*[_type == "storeLocation" && (lower(name) == $name || upper(code) == $code)][0]{_id}`,
      { name: name.toLowerCase(), code },
      { cache: "no-store" },
    );
    if (duplicate) return NextResponse.json({ message: "A store with that name or code already exists." }, { status: 409 });
    const now = new Date().toISOString();
    await serverClient.create({
      _id: `storeLocation.${randomUUID().replaceAll("-", "")}`,
      _type: "storeLocation",
      name,
      code,
      locationType,
      address: address || undefined,
      active: body.active !== false,
      createdAt: now,
      updatedAt: now,
    });
    return NextResponse.json({ locations: await listLocations(true) }, { status: 201 });
  } catch (cause) {
    return NextResponse.json({ message: cause instanceof Error ? cause.message : "Unable to create store." }, { status: 400 });
  }
}
