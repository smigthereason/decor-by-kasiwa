import { NextRequest, NextResponse } from "next/server";
import { getApiStaff } from "@/lib/auth/api-authorization";
import { serverClient } from "@/sanity/lib/serverClient";
import { revalidatePath } from "next/cache";

// Remove the image reference on the product, not the Sanity image asset:
// assets may be shared with other products or historic content.
export async function DELETE(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  const staff = await getApiStaff(["ADMIN", "STORE"]);
  if (!staff.ok) return NextResponse.json({ message: "Only Admin and Store Manager can remove product images." }, { status: staff.status });
  const { id } = await context.params;
  const productId = decodeURIComponent(id);
  let body: { kind?: "hero" | "gallery" | "variant"; key?: string; expectedRevision?: string };
  try { body = await request.json(); }
  catch { return NextResponse.json({ message: "Invalid image removal request." }, { status: 400 }); }
  if (!body || !["hero", "gallery", "variant"].includes(body.kind || "") || !body.expectedRevision) {
    return NextResponse.json({ message: "Select an image and reload the product before deleting it." }, { status: 400 });
  }
  try {
    type StoredImage = { _key: string; [key: string]: unknown };
    type StoredVariant = { _key: string; image?: unknown; [key: string]: unknown };
    const product = await serverClient.fetch<{
      _rev: string; heroImage?: unknown; gallery?: StoredImage[]; variants?: StoredVariant[];
    } | null>(
      `*[_type == "product" && _id == $productId][0]{_rev,heroImage,gallery,variants}`,
      { productId }, { cache: "no-store" },
    );
    if (!product) return NextResponse.json({ message: "Product not found." }, { status: 404 });
    if (product._rev !== body.expectedRevision) return NextResponse.json({ message: "Product was updated elsewhere. Refresh before removing the image." }, { status: 409 });
    let patch = serverClient.patch(productId).ifRevisionId(product._rev);
    if (body.kind === "hero") {
      if (!product.heroImage) return NextResponse.json({ message: "Product has no hero image." }, { status: 400 });
      patch = patch.unset(["heroImage"]);
    } else if (body.kind === "gallery") {
      if (!body.key || !(product.gallery || []).some((image) => image._key === body.key)) return NextResponse.json({ message: "Gallery image not found." }, { status: 404 });
      patch = patch.set({ gallery: (product.gallery || []).filter((image) => image._key !== body.key) });
    } else {
      if (!body.key || !(product.variants || []).some((variant) => variant._key === body.key && variant.image)) return NextResponse.json({ message: "Variant image not found." }, { status: 404 });
      patch = patch.set({ variants: (product.variants || []).map((variant) => {
        if (variant._key !== body.key) return variant;
        const { image: _image, ...withoutImage } = variant;
        return withoutImage;
      }) });
    }
    const result = await patch.commit();
    revalidatePath("/shop");
    return NextResponse.json({ ok: true, revision: result._rev });
  } catch (cause) {
    console.error("Unable to remove product image:", cause);
    return NextResponse.json({ message: "Product changed while removing its image. Refresh and try again." }, { status: 409 });
  }
}
