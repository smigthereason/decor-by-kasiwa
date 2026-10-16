import { NextResponse } from "next/server";

import { getApiStaff } from "@/lib/auth/api-authorization";
import { getCustomerByDocumentId } from "@/lib/auth/sanity-users";
import type { BackofficeNotifications } from "@/lib/operations/types";
import { serverClient } from "@/sanity/lib/serverClient";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function GET() {
  const staff = await getApiStaff(["ADMIN", "STORE", "MANAGER", "STORE_STAFF", "PRODUCTION_STAFF", "PACKAGING_STAFF", "DELIVERY_STAFF"]);
  if (!staff.ok) return NextResponse.json({ message: staff.status === 401 ? "Authentication required." : "Access denied." }, { status: staff.status });

  try {
    const customer = await getCustomerByDocumentId(staff.customerId);
    const manager = staff.role === "ADMIN" || staff.role === "STORE" || staff.role === "MANAGER";
    const stages: string[] = [];
    if (staff.role === "PRODUCTION_STAFF" || customer?.permissions?.includes("PRODUCTION")) stages.push("PRODUCTION");
    if (staff.role === "PACKAGING_STAFF" || customer?.permissions?.includes("PACKAGING")) stages.push("PACKAGING");
    if (staff.role === "DELIVERY_STAFF" || customer?.permissions?.includes("DELIVERY")) stages.push("DELIVERY");
    const scopedStoreId = (staff.role === "MANAGER" || staff.role === "STORE_STAFF" || staff.role === "PRODUCTION_STAFF" || staff.role === "PACKAGING_STAFF" || staff.role === "DELIVERY_STAFF")
      ? staff.storeLocationId || ""
      : "";
    const counts = await serverClient.fetch<BackofficeNotifications>(
      `{
        "newOrders": count(*[_type == "commerceOrder" && paymentStatus == "paid" && status in ["ready_for_store", "processing", "paid"] && !defined(dispatchedAt) && (!defined($storeId) || $storeId == "" || storeLocation._ref == $storeId)]),
        "deliveries": count(*[_type == "shipment" && status == "dispatched" && !defined(deliveredAt) && (!defined($storeId) || $storeId == "" || coalesce(storeLocation._ref,order->storeLocation._ref) == $storeId)]),
        "restockRequests": count(*[_type == "restockRequest" && status in ["open", "acknowledged"]]),
        "workflowJobs": count(*[_type == "commerceOrder" && paymentStatus == "paid" && defined(currentFulfilmentStage) && currentFulfilmentStage != "COMPLETED" && (!defined($storeId) || $storeId == "" || storeLocation._ref == $storeId) && ($manager || currentFulfilmentStage in $stages) && ($manager || assignedFulfilmentStaff._ref == $staffId)])
      }`,
      { manager, stages, staffId: staff.customerId, storeId: scopedStoreId || null },
      { cache: "no-store" },
    );
    return NextResponse.json(counts, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    console.error("Back-office notification count failed:", error);
    return NextResponse.json({ message: "Notification counts could not be loaded." }, { status: 500 });
  }
}
