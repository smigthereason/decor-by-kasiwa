import { NextResponse } from "next/server";

import { getApiStaff } from "@/lib/auth/api-authorization";
import { listSalesCashiers, listSalesHistory } from "@/lib/pos/operations";
import { dbk61ReadHistory, dbk61SandboxAllowed } from "@/lib/db/dbk61-pos-compat";
import { dbk62ReadEnabled, dbk62ReadHistory } from "@/lib/db/dbk62-pos-cutover";
import { dbk68ReadEnabled, dbk68ListHistory } from "@/lib/db/dbk68-daraja-neon";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const staff = await getApiStaff(["ADMIN", "STORE", "MANAGER"]);
  if (!staff.ok) return NextResponse.json({ message: "Unauthorized." }, { status: staff.status });
  if (staff.role === "MANAGER" && !staff.storeLocationId) return NextResponse.json({ message: "Manager must be assigned to a store." }, { status: 403 });
  const params = new URL(request.url).searchParams;
  const channel = params.get("channel");
  const cashier = params.get("cashier")?.trim() || undefined;
  const query = params.get("q")?.trim() || undefined;
  const from = params.get("from")?.trim() || undefined;
  const to = params.get("to")?.trim() || undefined;
  const limit = Number(params.get("limit") || 150);
  const requestedStoreId = params.get("store")?.trim() || undefined;
  const storeId = staff.role === "MANAGER" ? staff.storeLocationId : requestedStoreId;
  if (params.has("dbk61")) {
    if (params.get("dbk61") !== "test" || staff.role !== "ADMIN" || !dbk61SandboxAllowed(request)) {
      return NextResponse.json({ message: "Not found" }, { status: 404 });
    }
    try {
      const orders = await dbk61ReadHistory({ limit, channel: channel === "POS" || channel === "ONLINE" ? channel : undefined, cashier, query, from, to, storeId });
      return NextResponse.json({ orders, cashiers: [...new Set(orders.map(o=>o.soldByName))].sort(), testOnly: true },
        { headers: { "Cache-Control": "private, no-store" } });
    } catch {
      return NextResponse.json({ message: "Test-branch history unavailable" }, { status: 409 });
    }
  }

  try {
    const [orders, cashiers] = await Promise.all([
      listSalesHistory({ limit, channel: channel === "POS" || channel === "ONLINE" ? channel : undefined, cashier, query, from, to, storeId }),
      listSalesCashiers(storeId),
    ]);
    if (dbk62ReadEnabled()) {
      const neonOrders = await dbk62ReadHistory({ limit:500,channel:channel === "POS" || channel === "ONLINE" ? channel : undefined,
        cashier,query,from,to,storeId });
      const darajaOrders = dbk68ReadEnabled() && channel !== "ONLINE" ? await dbk68ListHistory() : [];
      const filteredDaraja = darajaOrders.filter(o =>
        (!storeId || o.storeLocationId===storeId) &&
        (!cashier || o.soldByName===cashier) &&
        (!query || [o.orderNumber,o.customerName,o.customerPhone].some(v=>v.toLowerCase().includes(query.toLowerCase()))) &&
        (!from || o.soldAt >= `${from}T00:00:00+03:00`) &&
        (!to || o.soldAt <= `${to}T23:59:59+03:00`));
      const combined = [...orders,...neonOrders,...filteredDaraja].sort((a,b)=>b.soldAt.localeCompare(a.soldAt))
        .slice(0,Math.max(1,Math.min(500,Math.floor(Number.isFinite(limit)?limit:150))));
      return NextResponse.json({orders:combined,cashiers:[...new Set([...cashiers,...neonOrders.map(o=>o.soldByName),...filteredDaraja.map(o=>o.soldByName)])].sort()},
        {headers:{"Cache-Control":"private, no-store"}});
    }
    return NextResponse.json({ orders, cashiers });
  } catch (cause) {
    return NextResponse.json({ message: cause instanceof Error ? cause.message : "Unable to load sales history." }, { status: dbk62ReadEnabled() ? 503 : 400 });
  }
}
