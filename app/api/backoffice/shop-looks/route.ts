import { NextResponse } from "next/server";

import { getApiStaff } from "@/lib/auth/api-authorization";
import { serverClient } from "@/sanity/lib/serverClient";

export const dynamic = "force-dynamic";

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
  return {
    body,
    heroImage: image instanceof File && image.size > 0 ? image : null,
  };
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

async function options() {
  const [looks, products, spaces, styles] = await Promise.all([
    serverClient.fetch(
      `*[_type == "shopLook"] | order(featured desc, displayOrder asc, title asc) {
        _id,
        title,
        "slug": slug.current,
        eyebrow,
        description,
        featured,
        active,
        displayOrder,
        seoTitle,
        seoDescription,
        "heroImageUrl": heroImage.asset->url,
        "spaceId": space._ref,
        "spaceTitle": space->title,
        "styleId": style._ref,
        "styleTitle": style->title,
        "products": products[]{
          _key,
          quantity,
          note,
          "productId": product._ref,
          "productName": product->name,
          "productSku": product->sku,
          "productImage": product->heroImage.asset->url,
          "productPrice": product->price,
          "productAvailable": product->available
        }
      }`,
      {},
      { cache: "no-store" },
    ),
    serverClient.fetch(
      `*[_type == "product" && defined(name)] | order(name asc) {
        _id,
        name,
        sku,
        price,
        initialStock,
        available,
        "image": heroImage.asset->url
      }`,
      {},
      { cache: "no-store" },
    ),
    serverClient.fetch(
      `*[_type == "shopSpace" && active != false] | order(displayOrder asc, title asc) {_id, title}`,
      {},
      { cache: "no-store" },
    ),
    serverClient.fetch(
      `*[_type == "shopStyle" && active != false] | order(displayOrder asc, title asc) {_id, title}`,
      {},
      { cache: "no-store" },
    ),
  ]);

  return { looks, products, spaces, styles };
}

export async function GET() {
  const staff = await getApiStaff(["ADMIN", "STORE"]);
  if (!staff.ok) {
    return NextResponse.json({ message: "Access denied." }, { status: staff.status });
  }

  try {
    return NextResponse.json(await options());
  } catch (error) {
    console.error("Shop by Look fetch failed:", error);
    return NextResponse.json({ message: "Shop by Look data could not be loaded." }, { status: 500 });
  }
}

export async function POST(request: Request) {
  const staff = await getApiStaff(["ADMIN", "STORE"]);
  if (!staff.ok) {
    return NextResponse.json({ message: "Access denied." }, { status: staff.status });
  }

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

    const duplicate = await serverClient.fetch<{ _id: string } | null>(
      `*[_type == "shopLook" && slug.current == $slug][0]{_id}`,
      { slug },
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
    const document = await serverClient.create({
      _type: "shopLook",
      title,
      slug: { _type: "slug", current: slug },
      eyebrow: body.eyebrow?.trim() || "",
      description,
      ...(heroImage ? { heroImage } : {}),
      ...(body.spaceId ? { space: { _type: "reference", _ref: body.spaceId } } : {}),
      ...(body.styleId ? { style: { _type: "reference", _ref: body.styleId } } : {}),
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
    });

    if (body.featured === true) {
      const otherFeatured = await serverClient.fetch<string[]>(
        `*[_type == "shopLook" && _id != $id && featured == true]._id`,
        { id: document._id },
        { cache: "no-store" },
      );
      if (otherFeatured.length) {
        let transaction = serverClient.transaction();
        for (const id of otherFeatured) {
          transaction = transaction.patch(id, (patch) => patch.set({ featured: false }));
        }
        await transaction.commit();
      }
    }

    return NextResponse.json({ ok: true, id: document._id, slug }, { status: 201 });
  } catch (error) {
    console.error("Shop by Look creation failed:", error);
    return NextResponse.json(
      { message: error instanceof Error ? error.message : "Shop by Look could not be created." },
      { status: 500 },
    );
  }
}
