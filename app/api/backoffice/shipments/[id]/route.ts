import { NextRequest, NextResponse } from "next/server";

import { getApiStaff } from "@/lib/auth/api-authorization";
import type { OrderStatus, ShipmentStatus } from "@/lib/operations/types";
import { serverClient } from "@/sanity/lib/serverClient";

const shipmentStatuses: ShipmentStatus[] = [
  "awaiting_store",
  "received",
  "picking",
  "packed",
  "ready_dispatch",
  "dispatched",
  "delivered",
  "exception",
];

function orderStatusForShipment(status: ShipmentStatus): OrderStatus | null {
  if (status === "picking" || status === "received") return "picking";
  if (status === "packed" || status === "ready_dispatch") return "packed";
  return null;
}

export async function PATCH(
  request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  const staff = await getApiStaff(["ADMIN", "STORE"]);

  if (!staff.ok) {
    return NextResponse.json({ message: "Access denied." }, { status: staff.status });
  }

  const { id } = await context.params;
  const shipmentId = decodeURIComponent(id);
  const body = (await request.json()) as {
    status?: ShipmentStatus;
    carrier?: string;
    trackingNumber?: string;
    notes?: string;
  };

  if (body.status && !shipmentStatuses.includes(body.status)) {
    return NextResponse.json({ message: "Invalid shipment status." }, { status: 400 });
  }

  if (body.status === "dispatched" || body.status === "delivered") {
    return NextResponse.json(
      {
        message:
          body.status === "dispatched"
            ? "Dispatch the related order from its order detail so duplicate dispatch is prevented."
            : "Delivery must be confirmed from the Deliveries workflow.",
      },
      { status: 409 },
    );
  }

  try {
    const shipment = await serverClient.fetch<{ orderId?: string; dispatchedAt?: string; status?: ShipmentStatus } | null>(
      `*[_type == "shipment" && _id == $id][0]{"orderId": order._ref, dispatchedAt, status}`,
      { id: shipmentId },
      { cache: "no-store" },
    );

    if (!shipment) {
      return NextResponse.json({ message: "Shipment not found." }, { status: 404 });
    }

    if (shipment.dispatchedAt || shipment.status === "dispatched" || shipment.status === "delivered") {
      if (body.status) {
        return NextResponse.json(
          { message: "A dispatched delivery cannot be moved back into preparation." },
          { status: 409 },
        );
      }
    }

    const now = new Date().toISOString();
    const set: Record<string, unknown> = { updatedAt: now };
    if (body.status) set.status = body.status;
    if (typeof body.carrier === "string") set.carrier = body.carrier.trim();
    if (typeof body.trackingNumber === "string") set.trackingNumber = body.trackingNumber.trim();
    if (typeof body.notes === "string") set.notes = body.notes.trim();

    const transaction = serverClient.transaction().patch(shipmentId, (patch) => patch.set(set));

    if (body.status && shipment.orderId) {
      const orderStatus = orderStatusForShipment(body.status);
      if (orderStatus) {
        transaction.patch(shipment.orderId, (patch) =>
          patch.set({ status: orderStatus, updatedAt: now }),
        );
      }
    }

    await transaction.commit();
    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("Shipment update failed:", error);
    return NextResponse.json({ message: "Shipment update failed." }, { status: 500 });
  }
}
