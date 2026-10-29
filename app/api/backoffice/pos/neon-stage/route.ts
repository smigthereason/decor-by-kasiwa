import { NextResponse } from "next/server";
import { getApiStaff } from "@/lib/auth/api-authorization";
import { previewDBK58ManualPosSale, type PosSaleInput } from "@/lib/pos/server";
import { serverClient } from "@/sanity/lib/serverClient";
import { getDBK60TestOrder, listDBK60TestOrders, stageDBK60ManualSale } from "@/lib/db/dbk60-pos-staging";

export const dynamic = "force-dynamic";

function testOnly(request: Request) {
  const url = new URL(request.url);
  return process.env.NODE_ENV === "development" &&
    process.env.DBK58_LOCAL_PREVIEW === "YES" &&
    process.env.DBK60_STAGING_TEST === "YES" &&
    process.env.DBK60_TEST_WRITE === "YES" &&
    ["localhost", "127.0.0.1"].includes(url.hostname);
}
const noCache = { "Cache-Control": "private, no-store" };

/** Real test-branch persistence. NEVER a live sale; references and money are synthetic. */
export async function POST(request: Request) {
  if (!testOnly(request)) return NextResponse.json({ message: "Not found" }, { status: 404 });
  if (request.headers.get("origin") !== new URL(request.url).origin ||
      !request.headers.get("content-type")?.toLowerCase().startsWith("application/json")) {
    return NextResponse.json({ message: "Same-origin JSON required" }, { status: 403 });
  }
  const staff = await getApiStaff(["ADMIN"]);
  if (!staff.ok) return NextResponse.json({ message: "Unauthorized" }, { status: staff.status });
  try {
    const input = (await request.json()) as PosSaleInput;
    if (!input || typeof input !== "object" || Array.isArray(input)) {
      return NextResponse.json({ message: "Invalid request" }, { status: 400 });
    }
    const storeId = typeof input.storeLocationId === "string" ? input.storeLocationId.trim() : "";
    if (!storeId) return NextResponse.json({ message: "Select a store" }, { status: 400 });
    const store = await serverClient.fetch<{ _id: string; name?: string; code?: string } | null>(
      `*[_type == "storeLocation" && _id == $id && active != false][0]{_id,name,code}`,
      { id: storeId }, { cache: "no-store" },
    );
    if (!store) return NextResponse.json({ message: "Select an active store" }, { status: 400 });
    const seller = {
      id: staff.customerId,
      name: staff.customerName,
      email: staff.customerEmail,
      role: staff.role,
      storeLocationId: store._id,
      storeLocationName: store.name || "Store",
      storeLocationCode: store.code || "",
    };
    const preview = await previewDBK58ManualPosSale(input, seller);
    // The display snapshot is strictly synthetic and stores no real customer PII.
    // Product names here are placeholders until receipt/history mapping is built.
    const display = {
      storeName: (store.name || "Test Store").slice(0,120),
      sellerName: "TEST ADMIN",
      productNames: preview.candidate.order.items.map((_, i) => `TEST ITEM ${i + 1}`),
    };
    const result = await stageDBK60ManualSale(preview.candidate, display);
    return NextResponse.json({
      stage: "DBK-60",
      mode: "ISOLATED_TEST_PERSISTED",
      simulatedPayment: true,
      productionWrites: false,
      testBranchStockChanged: !result.replayed,
      result,
      calculation: preview.calculation,
      readbackUrl: `/api/backoffice/pos/neon-stage?orderId=${encodeURIComponent(preview.candidate.order.orderId)}`,
    }, { headers: noCache });
  } catch (error) {
    console.error("[DBK-60 TEST] Staging failed:", error instanceof Error ? error.message : "unknown");
    return NextResponse.json({ message: "Isolated DBK-60 test failed; inspect development logs. Do not retry with a new request ID until checking order status.", stage: "DBK-60" },
      { status: 409, headers: noCache });
  }
}

/** Dev ADMIN-only isolated order / payment / stock readback (no production fallback). */
export async function GET(request: Request) {
  if (!testOnly(request)) return NextResponse.json({ message: "Not found" }, { status: 404 });
  const staff = await getApiStaff(["ADMIN"]);
  if (!staff.ok) return NextResponse.json({ message: "Unauthorized" }, { status: staff.status });
  try {
    const id = new URL(request.url).searchParams.get("orderId");
    if (id) {
      const order = await getDBK60TestOrder(id);
      return order ? NextResponse.json({ stage: "DBK-60", order }, { headers: noCache })
        : NextResponse.json({ message: "TEST order not found" }, { status: 404, headers: noCache });
    }
    return NextResponse.json({ stage: "DBK-60", orders: await listDBK60TestOrders() }, { headers: noCache });
  } catch (error) {
    console.error("[DBK-60 TEST] Readback failed:", error instanceof Error ? error.message : "unknown");
    return NextResponse.json({ message: "TEST branch readback failed" }, { status: 409, headers: noCache });
  }
}
