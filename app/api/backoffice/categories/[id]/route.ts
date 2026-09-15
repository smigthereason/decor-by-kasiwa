import { NextResponse } from "next/server";

import { getApiStaff } from "@/lib/auth/api-authorization";
import { serverClient } from "@/sanity/lib/serverClient";

export const dynamic = "force-dynamic";

const STAGES = ["PRODUCTION", "PACKAGING", "DELIVERY"] as const;
type Stage = (typeof STAGES)[number];
type CategoryPayload = {
  title?: string;
  slug?: string;
  description?: string;
  parentId?: string;
  displayOrder?: number;
  showInNavigation?: boolean;
  active?: boolean;
  fulfilmentStages?: Stage[];
};

function slugify(value: string) {
  return value.toLowerCase().normalize("NFKD").replace(/[^a-z0-9\s-]/g, "").trim().replace(/[\s_-]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 96) || "category";
}
function validStages(value: unknown): Stage[] {
  if (!Array.isArray(value)) return [];
  return STAGES.filter((stage) => value.includes(stage));
}
async function uploadImage(file: File | null) {
  if (!file) return undefined;
  if (!file.type.startsWith("image/")) throw new Error("Category image must be an image file.");
  if (file.size > 12 * 1024 * 1024) throw new Error("Category image must be 12 MB or smaller.");
  const asset = await serverClient.assets.upload("image", Buffer.from(await file.arrayBuffer()), { filename: file.name || `category-${Date.now()}`, contentType: file.type || undefined });
  return { _type: "image", asset: { _type: "reference", _ref: asset._id } };
}

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const staff = await getApiStaff(["ADMIN"]);
  if (!staff.ok) return NextResponse.json({ message: "Access denied." }, { status: staff.status });

  try {
    const { id } = await params;
    const form = await request.formData();
    const raw = form.get("payload");
    if (typeof raw !== "string") throw new Error("Category details are missing.");
    const body = JSON.parse(raw) as CategoryPayload;
    const title = body.title?.trim() || "";
    if (title.length < 2) throw new Error("Category name is required.");
    if (body.parentId === id) throw new Error("A category cannot be its own parent.");

    const slug = slugify(body.slug?.trim() || title);
    const duplicate = await serverClient.fetch<{ _id: string } | null>(`*[_type == "category" && _id != $id && slug.current == $slug][0]{_id}`, { id, slug });
    if (duplicate) return NextResponse.json({ message: "Another category already uses this name/slug." }, { status: 409 });

    const imageFile = form.get("image");
    const image = await uploadImage(imageFile instanceof File && imageFile.size > 0 ? imageFile : null);
    let patch = serverClient.patch(id).set({
      title,
      slug: { _type: "slug", current: slug },
      description: body.description?.trim() || "",
      displayOrder: Math.max(0, Math.floor(Number(body.displayOrder) || 100)),
      showInNavigation: body.showInNavigation !== false,
      active: body.active !== false,
      fulfilmentStages: validStages(body.fulfilmentStages),
    });
    patch = body.parentId ? patch.set({ parent: { _type: "reference", _ref: body.parentId } }) : patch.unset(["parent"]);
    if (image) patch = patch.set({ image });
    await patch.commit();
    return NextResponse.json({ ok: true });
  } catch (cause) {
    console.error("Category update failed:", cause);
    return NextResponse.json({ message: cause instanceof Error ? cause.message : "Unable to update category." }, { status: 400 });
  }
}
