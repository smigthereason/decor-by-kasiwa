import { NextResponse } from "next/server";
import { getApiStaff } from "@/lib/auth/api-authorization";
import { getStoreProducts } from "@/sanity/lib/catalog";
import { serverClient } from "@/sanity/lib/serverClient";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const channel = url.searchParams.get("channel") === "pos" ? "pos" : "ecommerce";
    let storeId: string | undefined;
    if (channel === "pos") {
      const staff = await getApiStaff(["ADMIN", "STORE", "MANAGER", "STORE_STAFF"]);
      if (!staff.ok) return NextResponse.json({ message: "Access denied." }, { status: staff.status });
      const requestedStore = (url.searchParams.get("storeLocationId") || "").trim();
      const storeLocked = staff.role === "MANAGER" || staff.role === "STORE_STAFF";
      if (storeLocked && requestedStore !== staff.storeLocationId) {
        return NextResponse.json({ message: "You can only view stock for your assigned store." }, { status: 403 });
      }
      if (!requestedStore) return NextResponse.json({ message: "Select a store to view POS stock." }, { status: 400 });
      const activeStore = await serverClient.fetch<string | null>(
        `*[_type == "storeLocation" && _id == $storeId && active != false][0]._id`,
        { storeId: requestedStore },
        { cache: "no-store" },
      );
      if (!activeStore) return NextResponse.json({ message: "Selected store is inactive or unavailable." }, { status: 400 });
      storeId = activeStore;
    }
    const products = await getStoreProducts(channel, storeId);
    return NextResponse.json(
      { products },
      {
        headers: channel === "pos"
          ? { "Cache-Control": "no-store, no-cache, must-revalidate" }
          : { "Cache-Control": "public, s-maxage=10, stale-while-revalidate=30" },
      },
    );
  } catch (error) {
    console.error("Catalogue API failed", {
      channel: new URL(request.url).searchParams.get("channel") === "pos" ? "pos" : "ecommerce",
      error,
    });
    return NextResponse.json({ message: "Unable to load product stock. Refresh and try again.", products: [] }, { status: 500 });
  }
}
