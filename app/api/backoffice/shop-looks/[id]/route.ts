import { NextResponse } from "next/server";

import { getApiStaff } from "@/lib/auth/api-authorization";
import { serverClient } from "@/sanity/lib/serverClient";

type LookInput = {
  title?: string;
  slug?: string;
  eyebrow?: string;
  description?: string;
  spaceId?: string;
  styleId?: string;
  featured?: boolean;
  active?: boolean;
  displayOrder?: number;
  seoTitle?: string;
  seoDescription?: string;
  products?: Array<{ productId?: string; quantity?: number; note?: string }>;
};

function slugify(value: string) {
  return value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 96);
}

function keyFor(productId: string, index: number) {
  return `${productId.replace(/[^a-zA-Z0-9_-]/g, "-")}-${index}`.slice(0, 96);
}

async function readLookRequest(request: Request) {
  const contentType = request.headers.get("content-type") || "";
  if (!contentType.includes("multipart/form-data")) {
    return { body: (await request.json()) as LookInput, heroImage: null as File | null };
  }

  const form = await request.formData();
  const rawPayload = form.get("payload");
  if (typeof rawPayload !== "string") throw new Error("Shop by Look payload is missing.");

  let body: LookInput;
  try {
    body = JSON.parse(rawPayload) as LookInput;
  } catch {
    throw new Error("Shop by Look payload is invalid.");
  }

  const image = form.get("heroImage");
  return { body, heroImage: image instanceof File && image.size > 0 ? image : null };
}

async function uploadLookImage(file: File | null) {
  if (!file) return undefined;
  if (!file.type.startsWith("image/")) throw new Error("Look image must be an image file.");
  if (file.size > 12 * 1024 * 1024) throw new Error("Look image must be 12 MB or smaller.");

  const asset = await serverClient.assets.upload("image", Buffer.from(await file.arrayBuffer()), {
    filename: file.name || `shop-look-${Date.now()}`,
    contentType: file.type || undefined,
  });
  return { _type: "image", asset: { _type: "reference", _ref: asset._id } };
}

export async function PATCH(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const staff = await getApiStaff(["ADMIN", "STORE"]);
  if (!staff.ok) {
    return NextResponse.json({ message: "Access denied." }, { status: staff.status });
  }

  const { id: rawId } = await context.params;
  const id = decodeURIComponent(rawId);

  try {
    const { body, heroImage: heroImageFile } = await readLookRequest(request);
    const title = body.title?.trim() || "";
    const description = body.description?.trim() || "";
    const slug = slugify(body.slug?.trim() || title);
    const productLines = (body.products || []).filter((line) => Boolean(line.productId));

    if (title.length < 3 || description.length < 20 || !slug || productLines.length < 1) {
      return NextResponse.json(
        { message: "Title, description and at least one product are required." },
        { status: 400 },
      );
    }

    const existing = await serverClient.fetch<{ _id: string } | null>(
      `*[_type == "shopLook" && _id == $id][0]{_id}`,
      { id },
      { cache: "no-store" },
    );
    if (!existing) {
      return NextResponse.json({ message: "Look not found." }, { status: 404 });
    }

    const duplicate = await serverClient.fetch<{ _id: string } | null>(
      `*[_type == "shopLook" && _id != $id && slug.current == $slug][0]{_id}`,
      { id, slug },
      { cache: "no-store" },
    );
    if (duplicate) {
      return NextResponse.json({ message: "Another look already uses this slug." }, { status: 409 });
    }

    const productIds = Array.from(new Set(productLines.map((line) => line.productId!)));
    const validIds = await serverClient.fetch<string[]>(
      `*[_type == "product" && _id in $ids]._id`,
      { ids: productIds },
      { cache: "no-store" },
    );
    if (validIds.length !== productIds.length) {
      return NextResponse.json({ message: "One or more selected products no longer exist." }, { status: 400 });
    }

    const heroImage = await uploadLookImage(heroImageFile);
    let patch = serverClient.patch(id).set({
      title,
      slug: { _type: "slug", current: slug },
      eyebrow: body.eyebrow?.trim() || "",
      description,
      products: productLines.map((line, index) => ({
        _key: keyFor(line.productId!, index),
        _type: "lookProduct",
        product: { _type: "reference", _ref: line.productId! },
        quantity: Math.max(1, Math.min(20, Math.floor(Number(line.quantity) || 1))),
        note: line.note?.trim().slice(0, 180) || "",
      })),
      featured: body.featured === true,
      active: body.active !== false,
      displayOrder: Math.max(0, Math.floor(Number(body.displayOrder) || 100)),
      seoTitle: body.seoTitle?.trim().slice(0, 70) || "",
      seoDescription: body.seoDescription?.trim().slice(0, 180) || "",
      ...(heroImage ? { heroImage } : {}),
    });

    if (body.spaceId) {
      patch = patch.set({ space: { _type: "reference", _ref: body.spaceId } });
    } else {
      patch = patch.unset(["space"]);
    }

    if (body.styleId) {
      patch = patch.set({ style: { _type: "reference", _ref: body.styleId } });
    } else {
      patch = patch.unset(["style"]);
    }

    await patch.commit();

    if (body.featured === true) {
      const otherFeatured = await serverClient.fetch<string[]>(
        `*[_type == "shopLook" && _id != $id && featured == true]._id`,
        { id },
        { cache: "no-store" },
      );
      if (otherFeatured.length) {
        let transaction = serverClient.transaction();
        for (const otherId of otherFeatured) {
          transaction = transaction.patch(otherId, (candidate) => candidate.set({ featured: false }));
        }
        await transaction.commit();
      }
    }

    return NextResponse.json({ ok: true, id, slug });
  } catch (error) {
    console.error("Shop by Look update failed:", error);
    return NextResponse.json(
      { message: error instanceof Error ? error.message : "Shop by Look could not be updated." },
      { status: 500 },
    );
  }
}

export async function DELETE(
  _request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const staff = await getApiStaff(["ADMIN", "STORE"]);
  if (!staff.ok) {
    return NextResponse.json({ message: "Access denied." }, { status: staff.status });
  }

  const { id: rawId } = await context.params;
  const id = decodeURIComponent(rawId);

  try {
    await serverClient.delete(id);
    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("Shop by Look deletion failed:", error);
    return NextResponse.json({ message: "Shop by Look could not be deleted." }, { status: 500 });
  }
}
