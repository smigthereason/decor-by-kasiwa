import { NextRequest, NextResponse } from "next/server";

import { getApiStaff } from "@/lib/auth/api-authorization";
import type { OrderStatus, PaymentStatus, ShipmentStatus } from "@/lib/operations/types";
import { serverClient } from "@/sanity/lib/serverClient";

const orderStatuses: OrderStatus[] = [
  "pending",
  "paid",
  "processing",
  "ready_for_store",
  "picking",
  "packed",
  "dispatched",
  "delivered",
  "cancelled",
];

const paymentStatuses: PaymentStatus[] = ["pending", "paid", "refunded", "failed"];

function shipmentId(orderId: string) {
  return `shipment.${orderId.replace(/[^a-zA-Z0-9._-]/g, "-")}`;
}

function shipmentStatusForOrder(status: OrderStatus): ShipmentStatus | null {
  if (status === "ready_for_store") return "awaiting_store";
  if (status === "picking") return "picking";
  if (status === "packed") return "packed";
  return null;
}

export async function PATCH(
  request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  const staff = await getApiStaff(["ADMIN", "STORE", "STORE_STAFF"]);

  if (!staff.ok) {
    return NextResponse.json({ message: "Access denied." }, { status: staff.status });
  }

  const { id } = await context.params;
  const orderId = decodeURIComponent(id);
  const body = (await request.json()) as {
    status?: OrderStatus;
    paymentStatus?: PaymentStatus;
    assignedStore?: string;
  };

  if (body.status && !orderStatuses.includes(body.status)) {
    return NextResponse.json({ message: "Invalid order status." }, { status: 400 });
  }

  if (body.paymentStatus && !paymentStatuses.includes(body.paymentStatus)) {
    return NextResponse.json({ message: "Invalid payment status." }, { status: 400 });
  }

  if (staff.role === "STORE_STAFF") {
    return NextResponse.json(
      { message: "Sales Staff cannot change order workflow. Use Deliveries to confirm a completed delivery." },
      { status: 403 },
    );
  }

  if (staff.role !== "ADMIN" && body.paymentStatus) {
    return NextResponse.json(
      { message: "Only Admin can change payment status." },
      { status: 403 },
    );
  }

  if (body.status === "dispatched" || body.status === "delivered") {
    return NextResponse.json(
      {
        message:
          body.status === "dispatched"
            ? "Use the Dispatch order action so duplicate dispatch is prevented."
            : "Delivery must be confirmed from the Deliveries workflow.",
      },
      { status: 409 },
    );
  }

  try {
    const order = await serverClient.fetch<{
      _id: string;
      orderNumber?: string;
      customerName?: string;
      deliveryLocation?: string;
      dispatchedAt?: string;
      status?: OrderStatus;
      shipment?: { _id: string } | null;
      lineItems?: { quantity?: number }[];
    } | null>(
      `*[_type == "commerceOrder" && _id == $id][0]{
        _id,
        orderNumber,
        customerName,
        deliveryLocation,
        dispatchedAt,
        status,
        "shipment": (*[_type == "shipment" && order._ref == ^._id] | order(updatedAt desc))[0]{_id},
        lineItems[]{quantity}
      }`,
      { id: orderId },
      { cache: "no-store" },
    );

    if (!order) {
      return NextResponse.json({ message: "Order not found." }, { status: 404 });
    }

    if (order.dispatchedAt || order.status === "dispatched" || order.status === "delivered") {
      if (body.status && body.status !== order.status) {
        return NextResponse.json(
          { message: "A dispatched order cannot be moved back into the preparation workflow." },
          { status: 409 },
        );
      }
    }

    const set: Record<string, unknown> = { updatedAt: new Date().toISOString() };
    if (body.status) set.status = body.status;
    if (body.paymentStatus && staff.role === "ADMIN") set.paymentStatus = body.paymentStatus;
    if (typeof body.assignedStore === "string") set.assignedStore = body.assignedStore.trim();

    const transaction = serverClient.transaction().patch(orderId, (patch) => patch.set(set));

    if (body.status) {
      const shipmentStatus = shipmentStatusForOrder(body.status);

      if (shipmentStatus) {
        const now = new Date().toISOString();
        const totalUnits = (order.lineItems || []).reduce(
          (sum, line) => sum + Number(line.quantity || 0),
          0,
        );

        if (order.shipment?._id) {
          transaction.patch(order.shipment._id, (patch) =>
            patch.set({ status: shipmentStatus, updatedAt: now }),
          );
        } else {
          const id = shipmentId(orderId);
          transaction.createIfNotExists({
            _id: id,
            _type: "shipment",
            shipmentNumber: `SHP-${Date.now().toString().slice(-6)}`,
            order: { _type: "reference", _ref: orderId },
            orderNumber: order.orderNumber || orderId,
            customerName: order.customerName || "Customer",
            destination: order.deliveryLocation || "Not supplied",
            createdAt: now,
            updatedAt: now,
            status: shipmentStatus,
            itemCount: order.lineItems?.length || 0,
            totalUnits,
          });
        }
      }
    }

    await transaction.commit();
    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("Order update failed:", error);
    return NextResponse.json({ message: "Order update failed." }, { status: 500 });
  }
}
