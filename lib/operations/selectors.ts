import type {
  AdminMetrics,
  InventoryItem,
  Order,
  Shipment,
  StoreMetrics,
} from "./types";

export function formatKes(value: number) {
  return new Intl.NumberFormat("en-KE", {
    style: "currency",
    currency: "KES",
    maximumFractionDigits: 0,
  }).format(value);
}

export function formatDateTime(value: string) {
  if (!value) return "—";

  return new Intl.DateTimeFormat("en-KE", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
}

export function availableStock(item: InventoryItem) {
  return Math.max(item.onHand - item.reserved, 0);
}

export function stockStatus(item: InventoryItem) {
  const available = availableStock(item);
  if (item.available === false || available <= 0) return "out" as const;
  if (available <= item.reorderPoint) return "low" as const;
  return "healthy" as const;
}

export function adminMetrics({
  orders,
  shipments,
  inventory,
}: {
  orders: Order[];
  shipments: Shipment[];
  inventory: InventoryItem[];
}): AdminMetrics {
  const revenue = orders
    .filter((order) => order.paymentStatus === "paid")
    .reduce((sum, order) => sum + order.total, 0);

  const openOrders = orders.filter(
    (order) => !["delivered", "cancelled"].includes(order.status),
  ).length;

  const fulfilmentQueue = shipments.filter(
    (shipment) => shipment.status !== "delivered",
  ).length;

  const lowStock = inventory.filter(
    (item) => stockStatus(item) !== "healthy",
  ).length;

  return { revenue, openOrders, fulfilmentQueue, lowStock };
}

export function storeMetrics({
  shipments,
  inventory,
}: {
  shipments: Shipment[];
  inventory: InventoryItem[];
}): StoreMetrics {
  return {
    awaitingReceipt: shipments.filter(
      (shipment) => shipment.status === "awaiting_store",
    ).length,
    beingPicked: shipments.filter(
      (shipment) => shipment.status === "picking",
    ).length,
    readyToDispatch: shipments.filter(
      (shipment) => shipment.status === "ready_dispatch",
    ).length,
    lowStock: inventory.filter(
      (item) => stockStatus(item) !== "healthy",
    ).length,
  };
}
