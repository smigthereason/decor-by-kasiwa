import { NextResponse } from "next/server";
import { getStoreProducts } from "@/sanity/lib/catalog";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const products = await getStoreProducts();
    return NextResponse.json({ products });
  } catch (error) {
    console.error("Catalogue API failed:", error);
    return NextResponse.json({ products: [] }, { status: 500 });
  }
}
