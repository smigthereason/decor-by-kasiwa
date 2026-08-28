import { NextRequest, NextResponse } from "next/server";

import { getApiStaff } from "@/lib/auth/api-authorization";
import { serverClient } from "@/sanity/lib/serverClient";

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  const staff = await getApiStaff(["STORE_STAFF", "STORE", "ADMIN"]);

  if (!staff.ok) {
    return NextResponse.json({ message: "Access denied." }, { status: staff.status });
  }

  const { id } = await context.params;
  const shipmentId = decodeURIComponent(id);
  const body = (await request.json().catch(() => ({}))) as { note?: string };

  try {
    const shipment = await serverClient.fetch<{
      _id: string;
      _rev: string;
      orderId?: string;
      status?: string;
      deliveredAt?: string;
    } | null>(
      `*[_type == "shipment" && _id == $id][0]{
        _id,
        _rev,
        "orderId": order._ref,
        status,
        deliveredAt
      }`,
      { id: shipmentId },
      { cache: "no-store" },
    );

    if (!shipment) {
      return NextResponse.json({ message: "Delivery not found." }, { status: 404 });
    }

    if (shipment.deliveredAt || shipment.status === "delivered") {
      return NextResponse.json({ message: "Delivery has already been confirmed." }, { status: 409 });
    }

    if (shipment.status !== "dispatched") {
      return NextResponse.json(
        { message: "Only dispatched orders can be confirmed as delivered." },
        { status: 409 },
      );
    }

    const order = shipment.orderId
      ? await serverClient.fetch<{ _id: string; _rev: string; status?: string; deliveredAt?: string } | null>(
          `*[_type == "commerceOrder" && _id == $id][0]{_id, _rev, status, deliveredAt}`,
          { id: shipment.orderId },
          { cache: "no-store" },
        )
      : null;

    if (order?.deliveredAt || order?.status === "delivered") {
      return NextResponse.json({ message: "Delivery has already been confirmed." }, { status: 409 });
    }

    const now = new Date().toISOString();
    const note = typeof body.note === "string" ? body.note.trim().slice(0, 600) : "";

    const transaction = serverClient.transaction().patch(shipment._id, (patch) =>
      patch.ifRevisionId(shipment._rev).set({
        status: "delivered",
        deliveredAt: now,
        deliveredBy: { _type: "reference", _ref: staff.customerId },
        deliveredByName: staff.customerName,
        deliveryConfirmationNote: note,
        updatedAt: now,
      }),
    );

    if (order) {
      transaction.patch(order._id, (patch) =>
        patch.ifRevisionId(order._rev).set({
          status: "delivered",
          deliveredAt: now,
          deliveredBy: { _type: "reference", _ref: staff.customerId },
          deliveredByName: staff.customerName,
          updatedAt: now,
        }),
      );
    }

    await transaction.commit();

    return NextResponse.json({ ok: true, message: "Delivery confirmed." });
  } catch (error) {
    const latest = await serverClient
      .fetch<{ status?: string; deliveredAt?: string } | null>(
        `*[_type == "shipment" && _id == $id][0]{status, deliveredAt}`,
        { id: shipmentId },
        { cache: "no-store" },
      )
      .catch(() => null);

    if (latest?.deliveredAt || latest?.status === "delivered") {
      return NextResponse.json({ message: "Delivery has already been confirmed." }, { status: 409 });
    }

    console.error("Delivery confirmation failed:", error);
    return NextResponse.json({ message: "Delivery could not be confirmed." }, { status: 500 });
  }
}
