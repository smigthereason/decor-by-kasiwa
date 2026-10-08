import { createHmac, timingSafeEqual } from "node:crypto";
import { revalidatePath } from "next/cache";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

const PUBLIC_TYPES = new Set([
  "product",
  "category",
  "shopLook",
  "shopSpace",
  "shopStyle",
  "collection",
]);

function safeEqual(left: string, right: string) {
  const a = Buffer.from(left);
  const b = Buffer.from(right);
  return a.length === b.length && timingSafeEqual(a, b);
}

function validSignature(body: string, header: string | null, secret: string) {
  if (!header) return false;
  const parts = Object.fromEntries(
    header.split(",").map((part) => {
      const index = part.indexOf("=");
      return [part.slice(0, index), part.slice(index + 1)];
    }),
  );
  const timestamp = parts.t;
  const signature = parts.v1;
  if (!timestamp || !signature) return false;
  const digest = createHmac("sha256", secret).update(`${timestamp}.${body}`).digest();
  return safeEqual(signature, digest.toString("hex")) || safeEqual(signature, digest.toString("base64"));
}

export async function POST(request: Request) {
  const secret = process.env.SANITY_REVALIDATE_SECRET?.trim();
  if (!secret) {
    return NextResponse.json({ message: "Revalidate secret is not configured." }, { status: 500 });
  }

  const body = await request.text();
  const signature = request.headers.get("sanity-webhook-signature");
  if (!validSignature(body, signature, secret)) {
    return NextResponse.json({ message: "Invalid webhook signature." }, { status: 401 });
  }

  let payload: { _id?: string; _type?: string } = {};
  try {
    payload = JSON.parse(body) as { _id?: string; _type?: string };
  } catch {
    return NextResponse.json({ message: "Invalid webhook payload." }, { status: 400 });
  }

  const id = payload._id || "";
  const type = payload._type || "";
  if (id.startsWith("drafts.") || !PUBLIC_TYPES.has(type)) {
    return NextResponse.json({ revalidated: false, ignored: true });
  }

  revalidatePath("/", "layout");
  revalidatePath("/shop", "layout");
  revalidatePath("/shop-by-look", "layout");

  return NextResponse.json({ revalidated: true, type });
}
