import { NextRequest, NextResponse } from "next/server";

import { getApiStaff } from "@/lib/auth/api-authorization";
import { serverClient } from "@/sanity/lib/serverClient";

function safeId(value: string) {
  return value.replace(/[^a-zA-Z0-9._-]/g, "-");
}

export async function POST(
  _request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  const staff = await getApiStaff(["ADMIN", "STORE"]);

  if (!staff.ok) {
    return NextResponse.json({ message: "Access denied." }, { status: staff.status });
  }

  const { id } = await context.params;
  const orderId = decodeURIComponent(id);

  try {
    const order = await serverClient.fetch<{
      _id: string;
      _rev: string;
      orderNumber?: string;
      customerName?: string;
      deliveryLocation?: string;
      status?: string;
      paymentStatus?: string;
      dispatchedAt?: string;
      lineItems?: { quantity?: number }[];
    } | null>(
      `*[_type == "commerceOrder" && _id == $id][0]{
        _id,
        _rev,
        orderNumber,
        customerName,
        deliveryLocation,
        status,
        paymentStatus,
        dispatchedAt,
        lineItems[]{quantity}
      }`,
      { id: orderId },
      { cache: "no-store" },
    );

    if (!order) {
      return NextResponse.json({ message: "Order not found." }, { status: 404 });
    }

    if (order.paymentStatus !== "paid") {
      return NextResponse.json(
        { message: "Only paid orders can be dispatched for delivery." },
        { status: 409 },
      );
    }

    if (order.dispatchedAt || order.status === "dispatched" || order.status === "delivered") {
      return NextResponse.json(
        { message: "This order has already been dispatched and cannot be dispatched twice." },
        { status: 409 },
      );
    }

    if (order.status === "cancelled") {
      return NextResponse.json({ message: "Cancelled orders cannot be dispatched." }, { status: 409 });
    }

    const shipment = await serverClient.fetch<{
      _id: string;
      _rev: string;
      dispatchedAt?: string;
      status?: string;
    } | null>(
      `*[_type == "shipment" && order._ref == $orderId] | order(_updatedAt desc)[0]{
        _id,
        _rev,
        dispatchedAt,
        status
      }`,
      { orderId },
      { cache: "no-store" },
    );

    if (shipment?.dispatchedAt || shipment?.status === "dispatched" || shipment?.status === "delivered") {
      return NextResponse.json(
        { message: "This order has already been dispatched and cannot be dispatched twice." },
        { status: 409 },
      );
    }

    if (shipment?.status === "exception") {
      return NextResponse.json(
        { message: "Resolve the shipment exception before dispatching this order." },
        { status: 409 },
      );
    }

    const now = new Date().toISOString();
    const totalUnits = (order.lineItems || []).reduce(
      (sum, line) => sum + Number(line.quantity || 0),
      0,
    );

    const transaction = serverClient.transaction().patch(order._id, (patch) =>
      patch.ifRevisionId(order._rev).set({
        status: "dispatched",
        dispatchedAt: now,
        dispatchedBy: { _type: "reference", _ref: staff.customerId },
        dispatchedByName: staff.customerName,
        updatedAt: now,
      }),
    );

    if (shipment) {
      transaction.patch(shipment._id, (patch) =>
        patch.ifRevisionId(shipment._rev).set({
          status: "dispatched",
          dispatchedAt: now,
          dispatchedBy: { _type: "reference", _ref: staff.customerId },
          dispatchedByName: staff.customerName,
          updatedAt: now,
        }),
      );
    } else {
      transaction.createIfNotExists({
        _id: `shipment.dispatch.${safeId(order._id)}`,
        _type: "shipment",
        shipmentNumber: `SHP-${order.orderNumber || Date.now().toString().slice(-6)}`,
        order: { _type: "reference", _ref: order._id },
        orderNumber: order.orderNumber || order._id,
        customerName: order.customerName || "Customer",
        destination: order.deliveryLocation || "Not supplied",
        createdAt: now,
        updatedAt: now,
        status: "dispatched",
        itemCount: order.lineItems?.length || 0,
        totalUnits,
        dispatchedAt: now,
        dispatchedBy: { _type: "reference", _ref: staff.customerId },
        dispatchedByName: staff.customerName,
        notes: "Created when an Admin or Store Manager dispatched the order for delivery.",
      });
    }

    await transaction.commit();

    return NextResponse.json({
      ok: true,
      message: "Order dispatched. Sales staff can now see it under Deliveries.",
    });
  } catch (error) {
    // A simultaneous second dispatch will lose the revision race. Re-check the
    // order so the caller receives the useful idempotency message instead of a 500.
    const latest = await serverClient
      .fetch<{ status?: string; dispatchedAt?: string } | null>(
        `*[_type == "commerceOrder" && _id == $id][0]{status, dispatchedAt}`,
        { id: orderId },
        { cache: "no-store" },
      )
      .catch(() => null);

    if (latest?.dispatchedAt || latest?.status === "dispatched" || latest?.status === "delivered") {
      return NextResponse.json(
        { message: "This order has already been dispatched and cannot be dispatched twice." },
        { status: 409 },
      );
    }

    console.error("Order dispatch failed:", error);
    return NextResponse.json({ message: "Order could not be dispatched." }, { status: 500 });
  }
}
