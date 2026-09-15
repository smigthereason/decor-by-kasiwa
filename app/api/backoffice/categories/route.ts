import { randomUUID } from "node:crypto";

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
  return value
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[^a-z0-9\s-]/g, "")
    .trim()
    .replace(/[\s_-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 96) || "category";
}

function validStages(value: unknown): Stage[] {
  if (!Array.isArray(value)) return [];
  return STAGES.filter((stage) => value.includes(stage));
}

async function readRequest(request: Request) {
  const type = request.headers.get("content-type") || "";
  if (!type.includes("multipart/form-data")) {
    return { body: await request.json() as CategoryPayload, image: null as File | null };
  }
  const form = await request.formData();
  const raw = form.get("payload");
  if (typeof raw !== "string") throw new Error("Category details are missing.");
  const body = JSON.parse(raw) as CategoryPayload;
  const file = form.get("image");
  return { body, image: file instanceof File && file.size > 0 ? file : null };
}

async function uploadImage(file: File | null) {
  if (!file) return undefined;
  if (!file.type.startsWith("image/")) throw new Error("Category image must be an image file.");
  if (file.size > 12 * 1024 * 1024) throw new Error("Category image must be 12 MB or smaller.");
  const asset = await serverClient.assets.upload("image", Buffer.from(await file.arrayBuffer()), {
    filename: file.name || `category-${Date.now()}`,
    contentType: file.type || undefined,
  });
  return { _type: "image", asset: { _type: "reference", _ref: asset._id } };
}

async function listCategories() {
  return serverClient.fetch(
    `*[_type == "category"] | order(displayOrder asc, title asc) {
      _id, title, "slug": slug.current, description, displayOrder, showInNavigation, active,
      fulfilmentStages,
      "imageUrl": image.asset->url,
      "parentId": parent._ref,
      "parentTitle": parent->title
    }`,
    {},
    { cache: "no-store" },
  );
}

export async function GET() {
  const staff = await getApiStaff(["ADMIN"]);
  if (!staff.ok) return NextResponse.json({ message: "Access denied." }, { status: staff.status });
  return NextResponse.json({ categories: await listCategories() });
}

export async function POST(request: Request) {
  const staff = await getApiStaff(["ADMIN"]);
  if (!staff.ok) return NextResponse.json({ message: "Access denied." }, { status: staff.status });

  try {
    const { body, image: imageFile } = await readRequest(request);
    const title = body.title?.trim() || "";
    if (title.length < 2) return NextResponse.json({ message: "Category name is required." }, { status: 400 });

    const slug = slugify(body.slug?.trim() || title);
    const duplicate = await serverClient.fetch<{ _id: string } | null>(
      `*[_type == "category" && slug.current == $slug][0]{_id}`,
      { slug },
      { cache: "no-store" },
    );
    if (duplicate) return NextResponse.json({ message: "Another category already uses this name/slug." }, { status: 409 });

    if (body.parentId) {
      const parent = await serverClient.fetch<{ _id: string } | null>(`*[_type == "category" && _id == $id][0]{_id}`, { id: body.parentId });
      if (!parent) return NextResponse.json({ message: "Selected parent category no longer exists." }, { status: 400 });
    }

    const image = await uploadImage(imageFile);
    const document = await serverClient.create({
      _id: `category.${randomUUID().replaceAll("-", "")}`,
      _type: "category",
      title,
      slug: { _type: "slug", current: slug },
      description: body.description?.trim() || "",
      ...(body.parentId ? { parent: { _type: "reference", _ref: body.parentId } } : {}),
      ...(image ? { image } : {}),
      displayOrder: Math.max(0, Math.floor(Number(body.displayOrder) || 100)),
      showInNavigation: body.showInNavigation !== false,
      active: body.active !== false,
      fulfilmentStages: validStages(body.fulfilmentStages),
    });

    return NextResponse.json({ category: document, categories: await listCategories() }, { status: 201 });
  } catch (cause) {
    console.error("Category create failed:", cause);
    return NextResponse.json({ message: cause instanceof Error ? cause.message : "Unable to create category." }, { status: 400 });
  }
}
