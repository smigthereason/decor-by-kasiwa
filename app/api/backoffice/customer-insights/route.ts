import { NextRequest, NextResponse } from "next/server";

import { getApiStaff } from "@/lib/auth/api-authorization";
import { serverClient } from "@/sanity/lib/serverClient";

export const dynamic = "force-dynamic";

type CustomerInsight = {
  id: string;
  name: string;
  email: string;
  phone: string;
  source?: string;
  lastProductViewAt?: string;
  recentlyViewed: Array<{
    productId: string;
    name: string;
    slug: string;
    imageUrl?: string;
    viewedAt: string;
  }>;
};

export async function GET(request: NextRequest) {
  const staff = await getApiStaff(["ADMIN", "STORE", "STORE_STAFF"]);
  if (!staff.ok) return NextResponse.json({ message: "Access denied." }, { status: staff.status });

  const id = request.nextUrl.searchParams.get("id")?.trim().replace(/^drafts\./, "") || "";
  const q = request.nextUrl.searchParams.get("q")?.trim() || "";
  const qMatch = q ? `*${q}*` : "*";

  const customers = await serverClient.fetch<CustomerInsight[]>(
    `*[
      _type == "customerUser" &&
      role == "CUSTOMER" &&
      ($id == "" || _id == $id) &&
      ($q == "" || name match $qMatch || email match $qMatch || phone match $qMatch)
    ] | order(lastProductViewAt desc, _updatedAt desc)[0...40]{
      "id": _id,
      name,
      "email": coalesce(email, ""),
      "phone": coalesce(phone, ""),
      source,
      lastProductViewAt,
      "recentlyViewed": coalesce(recentlyViewedProducts, [])[]{
        "productId": product._ref,
        "name": coalesce(product->name, nameSnapshot, "Product"),
        "slug": coalesce(product->slug.current, slugSnapshot, ""),
        "imageUrl": coalesce(product->heroImage.asset->url, imageUrlSnapshot, ""),
        viewedAt
      }
    }`,
    { id, q, qMatch },
  );

  return NextResponse.json({ customers });
}
