import { NextResponse } from "next/server";
import { getApiStaff } from "@/lib/auth/api-authorization";
import { getStoreProducts } from "@/sanity/lib/catalog";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    const channel = new URL(request.url).searchParams.get("channel") === "pos" ? "pos" : "ecommerce";
    if (channel === "pos") {
      const staff = await getApiStaff(["ADMIN", "STORE", "STORE_STAFF"]);
      if (!staff.ok) return NextResponse.json({ message: "Access denied." }, { status: staff.status });
    }
    const products = await getStoreProducts(channel);
    return NextResponse.json({ products });
  } catch (error) {
    console.error("Catalogue API failed:", error);
    return NextResponse.json({ products: [] }, { status: 500 });
  }
}
