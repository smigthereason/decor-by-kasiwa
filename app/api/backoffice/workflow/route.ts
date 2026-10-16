import { NextRequest, NextResponse } from "next/server";

import { getApiStaff } from "@/lib/auth/api-authorization";
import { getCustomerByDocumentId } from "@/lib/auth/sanity-users";
import type { FulfilmentStage } from "@/lib/operations/workflow";
import { serverClient } from "@/sanity/lib/serverClient";

export const dynamic = "force-dynamic";
const allowed = ["ADMIN", "STORE", "MANAGER", "STORE_STAFF", "PRODUCTION_STAFF", "PACKAGING_STAFF", "DELIVERY_STAFF"] as const;

export async function GET(request: NextRequest) {
  const staff = await getApiStaff([...allowed]);
  if (!staff.ok) return NextResponse.json({ message: "Access denied." }, { status: staff.status });
  const viewer = await getCustomerByDocumentId(staff.customerId);
  const manager = staff.role === "ADMIN" || staff.role === "STORE" || staff.role === "MANAGER";
  const stages = new Set<FulfilmentStage>();
  if (staff.role === "PRODUCTION_STAFF" || viewer?.permissions?.includes("PRODUCTION")) stages.add("PRODUCTION");
  if (staff.role === "PACKAGING_STAFF" || viewer?.permissions?.includes("PACKAGING")) stages.add("PACKAGING");
  if (staff.role === "DELIVERY_STAFF" || viewer?.permissions?.includes("DELIVERY")) stages.add("DELIVERY");

  const requestedStoreId = request.nextUrl.searchParams.get("store")?.trim() || "";
  const storeLocked = staff.role !== "ADMIN" && staff.role !== "STORE" && Boolean(staff.storeLocationId);
  const storeId = staff.role === "MANAGER"
    ? staff.storeLocationId || "__NONE__"
    : storeLocked
      ? staff.storeLocationId || "__NONE__"
      : requestedStoreId;

  const orders = await serverClient.fetch(
    `*[
      _type == "commerceOrder" &&
      paymentStatus == "paid" &&
      defined(currentFulfilmentStage) &&
      currentFulfilmentStage != "COMPLETED" &&
      (!defined($storeId) || $storeId == "" || storeLocation._ref == $storeId) &&
      ($manager || currentFulfilmentStage in $stages) &&
      ($manager || assignedFulfilmentStaff._ref == $staffId)
    ] | order(coalesce(paidAt,createdAt) asc) {
      "id": _id, orderNumber, customerName, customerPhone, deliveryLocation, salesChannel, status, paymentStatus,
      "orderDate": coalesce(paidAt,soldAt,createdAt), total, amountPaid, fulfilmentStages, currentFulfilmentStage,
      "assignedStaffId": assignedFulfilmentStaff._ref, assignedFulfilmentStaffName,
      "storeLocationId": storeLocation._ref,
      "storeLocationName": coalesce(storeLocation->name, assignedStore, "Unassigned"),
      "storeLocationCode": coalesce(storeLocation->code, ""),
      "items": lineItems[]{
        name, category, quantity,
        "image": product->heroImage.asset->url
      }
    }`,
    { manager, stages: [...stages], staffId: staff.customerId, storeId: storeId || null },
    { cache: "no-store" },
  );

  const [availableStaff, storeLocations] = await Promise.all([
    serverClient.fetch(
      `*[_type == "customerUser" && status == "ACTIVE" && role != "CUSTOMER"] | order(name asc) {_id,name,email,role,permissions,"assignedStoreId":assignedStore._ref,"assignedStoreName":assignedStore->name}`,
      {}, { cache: "no-store" },
    ),
    serverClient.fetch(
      `*[_type == "storeLocation" && active != false] | order(name asc){_id,name,code,locationType}`,
      {}, { cache: "no-store" },
    ),
  ]);

  return NextResponse.json({
    orders,
    availableStaff,
    storeLocations,
    viewer: {
      role: staff.role,
      customerId: staff.customerId,
      stages: [...stages],
      manager,
      assignedStoreId: staff.storeLocationId || "",
      assignedStoreName: staff.storeLocationName || "",
      storeLocked,
    },
  });
}
