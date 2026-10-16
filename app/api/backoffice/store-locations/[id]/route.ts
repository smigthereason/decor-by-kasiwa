import { NextResponse } from "next/server";

import { getApiStaff } from "@/lib/auth/api-authorization";
import { serverClient } from "@/sanity/lib/serverClient";

type StoreInput = { name?: string; code?: string; address?: string; locationType?: string; active?: boolean };
function clean(value: unknown) { return typeof value === "string" ? value.trim() : ""; }
function normalizeCode(value: string) { return value.toUpperCase().replace(/[^A-Z0-9]+/g, "-").replace(/^-+|-+$/g, ""); }
function normalizeLocationType(value: unknown) { return value === "MAIN" || value === "BRANCH" ? value : ""; }

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const staff = await getApiStaff(["ADMIN"]);
  if (!staff.ok) return NextResponse.json({ message: "Access denied." }, { status: staff.status });
  try {
    const { id } = await params;
    const body = (await request.json()) as StoreInput;
    const current = await serverClient.fetch<{ _id: string; name?: string; code?: string; locationType?: string } | null>(`*[_type == "storeLocation" && _id == $id][0]{_id,name,code,locationType}`, { id }, { cache: "no-store" });
    if (!current) return NextResponse.json({ message: "Store not found." }, { status: 404 });
    const name = body.name === undefined ? current.name || "" : clean(body.name);
    const code = body.code === undefined ? current.code || "" : normalizeCode(clean(body.code));
    const locationType = body.locationType === undefined ? normalizeLocationType(current.locationType) : normalizeLocationType(body.locationType);
    if (name.length < 2 || code.length < 2) return NextResponse.json({ message: "Store name and code are required." }, { status: 400 });
    if (!locationType) return NextResponse.json({ message: "Select whether this location is Main or Branch." }, { status: 400 });
    const duplicate = await serverClient.fetch<{ _id: string } | null>(`*[_type == "storeLocation" && _id != $id && (lower(name) == $name || upper(code) == $code)][0]{_id}`, { id, name: name.toLowerCase(), code }, { cache: "no-store" });
    if (duplicate) return NextResponse.json({ message: "A store with that name or code already exists." }, { status: 409 });
    let patch = serverClient.patch(id).set({
      name,
      code,
      locationType,
      ...(body.active !== undefined ? { active: body.active } : {}),
      updatedAt: new Date().toISOString(),
    });
    if (body.address !== undefined) {
      const address = clean(body.address);
      patch = address ? patch.set({ address }) : patch.unset(["address"]);
    }
    await patch.commit();
    return NextResponse.json({ ok: true });
  } catch (cause) {
    return NextResponse.json({ message: cause instanceof Error ? cause.message : "Unable to update store." }, { status: 400 });
  }
}

export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const staff = await getApiStaff(["ADMIN"]);
  if (!staff.ok) return NextResponse.json({ message: "Access denied." }, { status: staff.status });
  const { id } = await params;
  const usage = await serverClient.fetch<number>(
    `count(*[_type == "customerUser" && assignedStore._ref == $id]) +
     count(*[_type == "inventoryRecord" && (defaultStore._ref == $id || $id in locationBalances[].store._ref)]) +
     count(*[_type == "commerceOrder" && storeLocation._ref == $id]) +
     count(*[_type == "shipment" && storeLocation._ref == $id]) +
     count(*[_type == "expenseTransaction" && storeLocation._ref == $id])`,
    { id },
    { cache: "no-store" },
  );
  if (usage > 0) return NextResponse.json({ message: "This store is already referenced by staff, inventory, sales, shipments or expenditure. Mark it inactive instead of deleting it." }, { status: 409 });
  await serverClient.delete(id);
  return NextResponse.json({ ok: true });
}
