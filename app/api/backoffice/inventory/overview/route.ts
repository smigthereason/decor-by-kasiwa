import { NextResponse } from "next/server";

import { getApiStaff } from "@/lib/auth/api-authorization";
import { serverClient } from "@/sanity/lib/serverClient";

export const dynamic = "force-dynamic";

type ProductValue = { stock?: number; retail?: number; cost?: number };
type OrderRow = { createdAt?: string; subtotal?: number; discountAmount?: number; paymentStatus?: string; status?: string };
type ReceiptRow = { createdAt?: string; quantityChange?: number; unitCost?: number; movementValue?: number };

function monthKey(date: Date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
}

export async function GET() {
  const staff = await getApiStaff(["ADMIN", "STORE", "STORE_STAFF"]);
  if (!staff.ok) return NextResponse.json({ message: "Access denied." }, { status: staff.status });

  const start = new Date();
  start.setDate(1);
  start.setHours(0, 0, 0, 0);
  start.setMonth(start.getMonth() - 5);

  const [products, orders, receipts] = await Promise.all([
    serverClient.fetch<ProductValue[]>(
      `*[_type == "product"]{
        "stock": select(count(variants) > 0 => math::sum(variants[].stockQuantity), coalesce(initialStock, 0)),
        "retail": coalesce(price, 0),
        "cost": coalesce(*[_type == "inventoryRecord" && product._ref == ^._id][0].unitCost, procurementCost, 0)
      }`, {}, { cache: "no-store" },
    ),
    serverClient.fetch<OrderRow[]>(
      `*[_type == "commerceOrder" && createdAt >= $from && paymentStatus in ["paid", "partially_paid", "refunded"] && status != "cancelled"]{createdAt,subtotal,discountAmount,paymentStatus,status}`,
      { from: start.toISOString() }, { cache: "no-store" },
    ),
    serverClient.fetch<ReceiptRow[]>(
      `*[_type == "inventoryMovement" && createdAt >= $from && (movementType == "PURCHASE" || (movementType == "RECEIPT" && !defined(incomingBefore)))]{createdAt,quantityChange,unitCost,movementValue}`,
      { from: start.toISOString() }, { cache: "no-store" },
    ),
  ]);

  const months = Array.from({ length: 6 }, (_, index) => {
    const date = new Date(start);
    date.setMonth(start.getMonth() + index);
    return {
      key: monthKey(date),
      label: date.toLocaleDateString("en-KE", { month: "short", year: "numeric" }),
      sales: 0,
      purchases: 0,
    };
  });
  const byMonth = new Map(months.map((row) => [row.key, row]));

  for (const order of orders) {
    if (!order.createdAt) continue;
    const row = byMonth.get(monthKey(new Date(order.createdAt)));
    if (!row) continue;
    row.sales += Math.max(0, Number(order.subtotal || 0) - Number(order.discountAmount || 0));
  }
  for (const receipt of receipts) {
    if (!receipt.createdAt) continue;
    const row = byMonth.get(monthKey(new Date(receipt.createdAt)));
    if (!row) continue;
    row.purchases += Math.max(0, Number(receipt.movementValue ?? Math.abs(Number(receipt.quantityChange || 0)) * Number(receipt.unitCost || 0)));
  }

  const costValue = products.reduce((sum, product) => sum + Math.max(0, Number(product.stock || 0)) * Math.max(0, Number(product.cost || 0)), 0);
  const retailValue = products.reduce((sum, product) => sum + Math.max(0, Number(product.stock || 0)) * Math.max(0, Number(product.retail || 0)), 0);

  return NextResponse.json({
    months,
    stockValue: {
      cost: Math.round(costValue),
      retail: Math.round(retailValue),
      potentialMargin: Math.round(Math.max(0, retailValue - costValue)),
    },
  });
}
