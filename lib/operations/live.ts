import "server-only";

import { serverClient } from "@/sanity/lib/serverClient";

import { adminMetrics, storeMetrics } from "./selectors";
import type {
  ActivityEvent,
  Customer,
  InventoryItem,
  OperationsSnapshot,
  Order,
  RestockRequest,
  Shipment,
} from "./types";

type RawProduct = {
  _id: string;
  slug?: string;
  sku?: string;
  name?: string;
  price?: number;
  initialStock?: number;
  available?: boolean;
  category?: string;
  colours?: string[];
  image?: string;
  inventory?: {
    location?: string;
    reserved?: number;
    incoming?: number;
    reorderPoint?: number;
    unitCost?: number;
  } | null;
};

type RawCustomer = {
  _id: string;
  name?: string;
  email?: string;
  phone?: string;
  image?: string | null;
  googleId?: string | null;
  role?: "CUSTOMER" | "STORE_STAFF" | "STORE" | "ADMIN";
  status?: "ACTIVE" | "SUSPENDED";
  source?: "GOOGLE" | "GUEST_CHECKOUT" | "ADMIN";
  address1?: string;
  address2?: string;
  city?: string;
  region?: string;
  country?: string;
  firstPurchaseAt?: string;
  lastPurchaseAt?: string;
  createdAt?: string;
  lastLoginAt?: string;
};

function safeString(value: unknown, fallback = "—") {
  return typeof value === "string" && value.trim() ? value : fallback;
}

export async function getLiveProducts(): Promise<InventoryItem[]> {
  const rows = await serverClient.fetch<RawProduct[]>(
    `*[_type == "product" && defined(slug.current)] | order(name asc) {
      _id,
      name,
      sku,
      price,
      initialStock,
      available,
      "slug": slug.current,
      "category": primaryCategory->title,
      colours,
      "image": heroImage.asset->url,
      "inventory": *[_type == "inventoryRecord" && product._ref == ^._id][0]{
        location,
        reserved,
        incoming,
        reorderPoint,
        unitCost
      }
    }`,
    {},
    { cache: "no-store" },
  );

  return rows.map((row) => ({
    id: row._id,
    productId: row._id,
    slug: row.slug,
    sku: safeString(row.sku, "NO-SKU"),
    name: safeString(row.name, "Untitled product"),
    category: safeString(row.category, "Uncategorised"),
    finish: row.colours?.[0] || "",
    location: row.inventory?.location || "Unassigned",
    onHand: typeof row.initialStock === "number" ? row.initialStock : 0,
    reserved: row.inventory?.reserved || 0,
    incoming: row.inventory?.incoming || 0,
    reorderPoint: row.inventory?.reorderPoint ?? 5,
    unitCost: row.inventory?.unitCost || 0,
    retailPrice: typeof row.price === "number" ? row.price : 0,
    image: row.image || undefined,
    available: row.available !== false,
  }));
}

export async function getLiveOrders(): Promise<Order[]> {
  const rows = await serverClient.fetch<Order[]>(
    `*[_type == "commerceOrder"] | order(createdAt desc) {
      "id": _id,
      orderNumber,
      "customerId": coalesce(customer._ref, ""),
      customerName,
      customerEmail,
      customerPhone,
      deliveryLocation,
      createdAt,
      updatedAt,
      status,
      paymentStatus,
      subtotal,
      deliveryFee,
      total,
      assignedStore,
      paymentReference,
      salesChannel,
      fulfilmentType,
      soldByName,
      soldByRole,
      soldAt,
      paymentChannel,
      dispatchedAt,
      dispatchedByName,
      deliveredAt,
      deliveredByName,
      "lineItems": lineItems[]{
        "id": coalesce(_key, product._ref),
        "productId": coalesce(product._ref, productId),
        name,
        category,
        finish,
        size,
        variantId,
        quantity,
        unitPrice
      }
    }`,
    {},
    { cache: "no-store" },
  );

  return rows.map((row) => ({
    ...row,
    orderNumber: safeString(row.orderNumber, row.id),
    customerName: safeString(row.customerName, "Customer"),
    customerEmail: safeString(row.customerEmail, ""),
    customerPhone: safeString(row.customerPhone, ""),
    deliveryLocation: safeString(row.deliveryLocation, "Not supplied"),
    createdAt: row.createdAt || new Date(0).toISOString(),
    status: row.status || "pending",
    paymentStatus: row.paymentStatus || "pending",
    subtotal: Number(row.subtotal || 0),
    deliveryFee: Number(row.deliveryFee || 0),
    total: Number(row.total || 0),
    lineItems: Array.isArray(row.lineItems) ? row.lineItems : [],
  }));
}

export async function getLiveShipments(): Promise<Shipment[]> {
  const rows = await serverClient.fetch<Shipment[]>(
    `*[_type == "shipment"] | order(updatedAt desc) {
      "id": _id,
      shipmentNumber,
      "orderId": order._ref,
      orderNumber,
      customerName,
      destination,
      carrier,
      trackingNumber,
      createdAt,
      updatedAt,
      status,
      itemCount,
      totalUnits,
      notes,
      dispatchedAt,
      dispatchedByName,
      deliveredAt,
      deliveredByName,
      deliveryConfirmationNote
    }`,
    {},
    { cache: "no-store" },
  );

  return rows.map((row) => ({
    ...row,
    shipmentNumber: safeString(row.shipmentNumber, row.id),
    orderNumber: safeString(row.orderNumber, "—"),
    customerName: safeString(row.customerName, "Customer"),
    destination: safeString(row.destination, "Not supplied"),
    createdAt: row.createdAt || new Date(0).toISOString(),
    updatedAt: row.updatedAt || row.createdAt || new Date(0).toISOString(),
    status: row.status || "awaiting_store",
    itemCount: Number(row.itemCount || 0),
    totalUnits: Number(row.totalUnits || 0),
  }));
}

export async function getLiveRestockRequests(): Promise<RestockRequest[]> {
  const rows = await serverClient.fetch<RestockRequest[]>(
    `*[_type == "restockRequest"] | order(createdAt desc) {
      "id": _id,
      "productId": product._ref,
      productName,
      sku,
      "requestedById": requestedBy._ref,
      requestedByName,
      reason,
      note,
      status,
      createdAt,
      updatedAt,
      resolvedAt,
      resolvedByName
    }`,
    {},
    { cache: "no-store" },
  );

  return rows.map((row) => ({
    ...row,
    productName: safeString(row.productName, "Product"),
    sku: safeString(row.sku, "NO-SKU"),
    requestedByName: safeString(row.requestedByName, "Sales staff"),
    reason: row.reason || "needs_restock",
    status: row.status || "open",
    createdAt: row.createdAt || new Date(0).toISOString(),
    updatedAt: row.updatedAt || row.createdAt || new Date(0).toISOString(),
  }));
}

export async function getLiveCustomers(orders?: Order[]): Promise<Customer[]> {
  const [rows, liveOrders] = await Promise.all([
    serverClient.fetch<RawCustomer[]>(
      `*[_type == "customerUser"] | order(coalesce(lastPurchaseAt, lastLoginAt, createdAt) desc) {
        _id,
        name,
        email,
        phone,
        image,
        googleId,
        role,
        status,
        source,
        address1,
        address2,
        city,
        region,
        country,
        firstPurchaseAt,
        lastPurchaseAt,
        createdAt,
        lastLoginAt
      }`,
      {},
      { cache: "no-store" },
    ),
    orders ? Promise.resolve(orders) : getLiveOrders(),
  ]);

  return rows.map((row) => {
    const email = (row.email || "").toLowerCase();
    const customerOrders = liveOrders.filter(
      (order) => order.customerEmail.toLowerCase() === email,
    );
    const latestOrder = customerOrders[0];

    const profileLocation = [row.address1, row.city, row.region, row.country]
      .filter(Boolean)
      .join(", ");

    return {
      id: row._id,
      name: safeString(row.name, "Customer"),
      email: row.email || "",
      phone: row.phone || latestOrder?.customerPhone || "—",
      location: profileLocation || latestOrder?.deliveryLocation || "—",
      address1: row.address1,
      address2: row.address2,
      city: row.city,
      region: row.region,
      country: row.country,
      orders: customerOrders.length,
      lifetimeValue: customerOrders
        .filter((order) => order.paymentStatus === "paid")
        .reduce((sum, order) => sum + order.total, 0),
      lastOrderAt:
        latestOrder?.createdAt ||
        row.lastPurchaseAt ||
        row.lastLoginAt ||
        row.createdAt ||
        "",
      role: row.role,
      status: row.status,
      source: row.source,
      authenticated: Boolean(row.googleId),
      image: row.image,
    };
  });
}

function buildActivity({
  orders,
  shipments,
  customers,
}: {
  orders: Order[];
  shipments: Shipment[];
  customers: Customer[];
}): ActivityEvent[] {
  const events: ActivityEvent[] = [
    ...orders.slice(0, 6).map((order) => ({
      id: `order-${order.id}`,
      timestamp: order.soldAt || order.updatedAt || order.createdAt,
      actor: order.soldByName || order.dispatchedByName || order.deliveredByName || "Customer",
      action:
        order.salesChannel === "POS"
          ? `POS ${order.paymentChannel === "cash" ? "cash" : "M-PESA"} sale`
          : order.status === "delivered"
            ? "Order delivered"
            : order.status === "dispatched"
              ? "Order dispatched"
              : order.paymentStatus === "paid"
                ? "Paid order"
                : "Order created",
      detail: `${order.orderNumber} · ${order.customerName}`,
      type: "order" as const,
    })),
    ...shipments.slice(0, 6).map((shipment) => ({
      id: `shipment-${shipment.id}`,
      timestamp: shipment.updatedAt,
      actor: shipment.deliveredByName || shipment.dispatchedByName || "Operations",
      action: `Shipment ${shipment.status.replaceAll("_", " ")}`,
      detail: `${shipment.shipmentNumber} · ${shipment.customerName}`,
      type: "shipment" as const,
    })),
    ...customers.slice(0, 4).map((customer) => ({
      id: `customer-${customer.id}`,
      timestamp: customer.lastOrderAt,
      actor: "Customer",
      action: "Customer activity",
      detail: `${customer.name} · ${customer.email}`,
      type: "customer" as const,
    })),
  ];

  return events
    .filter((event) => Boolean(event.timestamp))
    .sort(
      (a, b) =>
        new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime(),
    )
    .slice(0, 10);
}

export async function getLiveOperationsSnapshot(): Promise<OperationsSnapshot> {
  const [products, orders, shipments, restockRequests] = await Promise.all([
    getLiveProducts(),
    getLiveOrders(),
    getLiveShipments(),
    getLiveRestockRequests(),
  ]);

  const customers = await getLiveCustomers(orders);
  const activity = buildActivity({ orders, shipments, customers });

  return {
    admin: adminMetrics({ orders, shipments, inventory: products }),
    store: storeMetrics({ shipments, inventory: products }),
    products,
    customers,
    orders,
    shipments,
    restockRequests,
    activity,
    source: "sanity-live",
  };
}
