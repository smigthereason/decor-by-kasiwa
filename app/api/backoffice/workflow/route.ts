import { NextResponse } from "next/server";

import { getApiStaff } from "@/lib/auth/api-authorization";
import { getCustomerByDocumentId } from "@/lib/auth/sanity-users";
import type { FulfilmentStage } from "@/lib/operations/workflow";
import { serverClient } from "@/sanity/lib/serverClient";

export const dynamic = "force-dynamic";
const allowed = ["ADMIN", "STORE", "STORE_STAFF", "PRODUCTION_STAFF", "PACKAGING_STAFF", "DELIVERY_STAFF"] as const;

export async function GET() {
  const staff = await getApiStaff([...allowed]);
  if (!staff.ok) return NextResponse.json({ message: "Access denied." }, { status: staff.status });
  const viewer = await getCustomerByDocumentId(staff.customerId);
  const manager = staff.role === "ADMIN" || staff.role === "STORE";
  const stages = new Set<FulfilmentStage>();
  if (staff.role === "PRODUCTION_STAFF" || viewer?.permissions?.includes("PRODUCTION")) stages.add("PRODUCTION");
  if (staff.role === "PACKAGING_STAFF" || viewer?.permissions?.includes("PACKAGING")) stages.add("PACKAGING");
  if (staff.role === "DELIVERY_STAFF" || viewer?.permissions?.includes("DELIVERY")) stages.add("DELIVERY");

  const orders = await serverClient.fetch(
    `*[_type == "commerceOrder" && paymentStatus == "paid" && defined(currentFulfilmentStage) && currentFulfilmentStage != "COMPLETED" && ($manager || currentFulfilmentStage in $stages) && ($manager || assignedFulfilmentStaff._ref == $staffId)] | order(coalesce(paidAt,createdAt) asc) {
      "id": _id, orderNumber, customerName, customerPhone, deliveryLocation, salesChannel, status, paymentStatus,
      total, amountPaid, fulfilmentStages, currentFulfilmentStage,
      "assignedStaffId": assignedFulfilmentStaff._ref, assignedFulfilmentStaffName,
      "items": lineItems[]{
        name, category, quantity,
        "image": product->heroImage.asset->url
      }
    }`,
    { manager, stages: [...stages], staffId: staff.customerId },
    { cache: "no-store" },
  );

  const availableStaff = await serverClient.fetch(
    `*[_type == "customerUser" && status == "ACTIVE" && role != "CUSTOMER"] | order(name asc) {_id,name,email,role,permissions}`,
    {}, { cache: "no-store" },
  );
  return NextResponse.json({ orders, availableStaff, viewer: { role: staff.role, customerId: staff.customerId, stages: [...stages], manager } });
}
