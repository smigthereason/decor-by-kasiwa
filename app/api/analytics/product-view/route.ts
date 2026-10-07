import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";

import { authOptions } from "@/lib/auth/options";
import { getCustomerByDocumentId } from "@/lib/auth/sanity-users";
import { serverClient } from "@/sanity/lib/serverClient";

export const dynamic = "force-dynamic";

const MAX_VIEWS = 12;
const MAX_AGE_MS = 90 * 24 * 60 * 60 * 1000;

type SubmittedEntry = { productId?: unknown; viewedAt?: unknown };
type ProductRecord = { _id: string; name?: string; slug?: string; imageUrl?: string | null };

function safeViewedAt(value: unknown) {
  const now = Date.now();
  const timestamp = typeof value === "string" ? Date.parse(value) : Number.NaN;
  if (!Number.isFinite(timestamp)) return new Date(now).toISOString();
  if (timestamp > now + 5 * 60 * 1000 || timestamp < now - MAX_AGE_MS) return new Date(now).toISOString();
  return new Date(timestamp).toISOString();
}

export async function POST(request: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) return NextResponse.json({ tracked: false, reason: "anonymous" });

  const customer = await getCustomerByDocumentId(session.user.id);
  if (!customer || customer.status !== "ACTIVE" || customer.role !== "CUSTOMER") {
    return NextResponse.json({ tracked: false, reason: "not-customer" });
  }

  const body = (await request.json().catch(() => ({}))) as { entries?: SubmittedEntry[] };
  const submitted = Array.isArray(body.entries) ? body.entries.slice(0, MAX_VIEWS) : [];

  const normalized = submitted
    .map((entry) => ({
      productId: typeof entry.productId === "string" ? entry.productId.trim().replace(/^drafts\./, "") : "",
      viewedAt: safeViewedAt(entry.viewedAt),
    }))
    .filter((entry) => Boolean(entry.productId));

  const unique = Array.from(new Map(normalized.map((entry) => [entry.productId, entry])).values()).slice(0, MAX_VIEWS);
  if (!unique.length) return NextResponse.json({ tracked: false, reason: "no-products" });

  const ids = unique.map((entry) => entry.productId);
  const products = await serverClient.fetch<ProductRecord[]>(
    `*[_type == "product" && _id in $ids]{_id,name,"slug":slug.current,"imageUrl":heroImage.asset->url}`,
    { ids },
  );
  const byId = new Map(products.map((product) => [product._id.replace(/^drafts\./, ""), product]));

  const recentlyViewedProducts = unique.flatMap((entry, index) => {
    const product = byId.get(entry.productId);
    if (!product) return [];
    return [
      {
        _key: `${entry.productId.replace(/[^A-Za-z0-9_-]/g, "-").slice(-48)}-${index}`,
        product: { _type: "reference", _ref: entry.productId },
        viewedAt: entry.viewedAt,
        nameSnapshot: product.name || "Product",
        slugSnapshot: product.slug || "",
        imageUrlSnapshot: product.imageUrl || "",
      },
    ];
  });

  await serverClient
    .patch(customer._id.replace(/^drafts\./, ""))
    .set({ recentlyViewedProducts, lastProductViewAt: recentlyViewedProducts[0]?.viewedAt || new Date().toISOString() })
    .commit();

  return NextResponse.json({ tracked: true, count: recentlyViewedProducts.length });
}
