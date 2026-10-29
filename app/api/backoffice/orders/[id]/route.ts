import { isNeonOnlineOrderId } from "@/lib/db/dbk65-online-fulfilment-core";
import { dbk65ChangeOnlineOrder } from "@/lib/db/dbk65-online-fulfilment";
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
  const staff = await getApiStaff(["ADMIN", "STORE", "MANAGER", "STORE_STAFF"]);

  if (!staff.ok) {
    return NextResponse.json({ message: "Access denied." }, { status: staff.status });
  }

  const { id } = await context.params;
  const orderId = decodeURIComponent(id);
  const body = (await request.json()) as {
    status?: OrderStatus;
    paymentStatus?: PaymentStatus;
    assignedStore?: string;
    storeLocationId?: string;
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

  // Neon online orders must never fall through to Sanity patches or shipment creation.
  if (isNeonOnlineOrderId(orderId)) {
    if (body.paymentStatus !== undefined || body.storeLocationId !== undefined || body.assignedStore !== undefined || !body.status) {
      return NextResponse.json({ message: "Neon online order accepts a fulfilment status only; payment is provider-controlled." }, { status: 409 });
    }
    try {
      const result=await dbk65ChangeOnlineOrder({ id:orderId,status:body.status,
        role:staff.role,actorId:staff.customerId,actorName:staff.customerName,
        assignedStoreId:staff.storeLocationId });
      return NextResponse.json(result,{headers:{"Cache-Control":"private, no-store"}});
    } catch (error) {
      return NextResponse.json({message:error instanceof Error ? error.message : 'Neon fulfilment unavailable'}, {status:409});
    }
  }

  try {
    const order = await serverClient.fetch<{
      _id: string;
      orderNumber?: string;
      customerName?: string;
      deliveryLocation?: string;
      dispatchedAt?: string;
      status?: OrderStatus;
      storeLocationId?: string;
      storeLocationName?: string;
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
        "storeLocationId": storeLocation._ref,
        "storeLocationName": coalesce(storeLocation->name, assignedStore, ""),
        "shipment": (*[_type == "shipment" && order._ref == ^._id] | order(updatedAt desc))[0]{_id},
        lineItems[]{quantity}
      }`,
      { id: orderId },
      { cache: "no-store" },
    );

    if (!order) {
      return NextResponse.json({ message: "Order not found." }, { status: 404 });
    }

    if (staff.role === "MANAGER") {
      if (!staff.storeLocationId) {
        return NextResponse.json({ message: "This Manager is not assigned to a store/location." }, { status: 403 });
      }
      if (order.storeLocationId !== staff.storeLocationId) {
        return NextResponse.json({ message: "Managers can only update orders assigned to their store/location." }, { status: 403 });
      }
      if (body.storeLocationId && body.storeLocationId !== staff.storeLocationId) {
        return NextResponse.json({ message: "Managers cannot move orders to another store/location." }, { status: 403 });
      }
    }

    if (order.dispatchedAt || order.status === "dispatched" || order.status === "delivered") {
      if (body.status && body.status !== order.status) {
        return NextResponse.json(
          { message: "A dispatched order cannot be moved back into the preparation workflow." },
          { status: 409 },
        );
      }
      if (body.storeLocationId && body.storeLocationId !== order.storeLocationId) {
        return NextResponse.json(
          { message: "A dispatched order cannot be moved to another store/location." },
          { status: 409 },
        );
      }
    }

    let selectedStore: { _id: string; name?: string; code?: string } | null = null;
    if (body.storeLocationId !== undefined) {
      if (staff.role !== "ADMIN" && staff.role !== "STORE") {
        if (body.storeLocationId !== order.storeLocationId) {
          return NextResponse.json({ message: "Only Admin or Store Manager can assign an order to a different store/location." }, { status: 403 });
        }
      }
      const requestedStoreId = typeof body.storeLocationId === "string" ? body.storeLocationId.trim() : "";
      if (!requestedStoreId) {
        return NextResponse.json({ message: "Select an active fulfilment store/location." }, { status: 400 });
      }
      selectedStore = await serverClient.fetch<{ _id: string; name?: string; code?: string } | null>(
        `*[_type == "storeLocation" && _id == $id && active != false][0]{_id,name,code}`,
        { id: requestedStoreId },
        { cache: "no-store" },
      );
      if (!selectedStore) {
        return NextResponse.json({ message: "Select an active fulfilment store/location." }, { status: 400 });
      }
    }

    const effectiveStoreId = selectedStore?._id || order.storeLocationId || "";
    const effectiveStoreName = selectedStore?.name || order.storeLocationName || "";

    const set: Record<string, unknown> = { updatedAt: new Date().toISOString() };
    if (body.status) set.status = body.status;
    if (body.paymentStatus && staff.role === "ADMIN") set.paymentStatus = body.paymentStatus;
    if (typeof body.assignedStore === "string") set.assignedStore = body.assignedStore.trim();
    if (selectedStore) {
      set.storeLocation = { _type: "reference", _ref: selectedStore._id };
      set.assignedStore = selectedStore.name || selectedStore.code || "Store";
    }

    const transaction = serverClient.transaction().patch(orderId, (patch) => patch.set(set));

    if (body.status) {
      const shipmentStatus = shipmentStatusForOrder(body.status);

      if (shipmentStatus) {
        if (!effectiveStoreId) {
          return NextResponse.json(
            { message: "Assign a fulfilment store/location before moving this order into store preparation." },
            { status: 400 },
          );
        }
        const now = new Date().toISOString();
        const totalUnits = (order.lineItems || []).reduce(
          (sum, line) => sum + Number(line.quantity || 0),
          0,
        );

        if (order.shipment?._id) {
          transaction.patch(order.shipment._id, (patch) =>
            patch.set({
              status: shipmentStatus,
              storeLocation: { _type: "reference", _ref: effectiveStoreId },
              updatedAt: now,
            }),
          );
        } else {
          const id = shipmentId(orderId);
          transaction.createIfNotExists({
            _id: id,
            _type: "shipment",
            shipmentNumber: `SHP-${Date.now().toString().slice(-6)}`,
            order: { _type: "reference", _ref: orderId },
            storeLocation: { _type: "reference", _ref: effectiveStoreId },
            orderNumber: order.orderNumber || orderId,
            customerName: order.customerName || "Customer",
            destination: order.deliveryLocation || "Not supplied",
            createdAt: now,
            updatedAt: now,
            status: shipmentStatus,
            itemCount: order.lineItems?.length || 0,
            totalUnits,
            notes: effectiveStoreName ? `Fulfilment store: ${effectiveStoreName}` : undefined,
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
