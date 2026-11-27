import { NextRequest, NextResponse } from "next/server";

import { getApiStaff } from "@/lib/auth/api-authorization";
import { getCustomerByDocumentId } from "@/lib/auth/sanity-users";
import type { FulfilmentStage } from "@/lib/operations/workflow";
import { serverClient } from "@/sanity/lib/serverClient";
import { dbk65OnlineReadsEnabled, dbk65ListOnlineOrders } from "@/lib/db/dbk65-online-fulfilment";
import { dbk134Enabled, dbk134Assignments, dbk134Stage } from "@/lib/db/dbk134-online-operations";
import { dbk136Enabled, dbk136ListWhatsappJobs } from '@/lib/db/dbk136-whatsapp-workflow';

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
      "id": _id, orderNumber, paymentReference, customerName, customerPhone, deliveryLocation, salesChannel, status, paymentStatus,
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

  // DBK133: DBK64 is Neon-owned. Never create duplicate Sanity commerceOrder documents.
  // Online queue is manager-operated until staff assignments are persisted in Neon.
  let onlineOrders: Array<{
    id: string; orderNumber: string; reference: string; customerName: string;
    storeLocationId: string; storeLocationName: string; orderDate: string;
    paymentStatus: string; status: string; stockReady: boolean;
    total: number; items: Array<{name:string; quantity:number}>;
    stage: "PRODUCTION"|"PACKAGING"|"DELIVERY"|null; assignedStaffId:string; assignedStaffName:string;
    channel?: string;
  }> = [];
  let onlineWarning = "";
  if (manager || dbk134Enabled()) {
    if (!dbk65OnlineReadsEnabled() || process.env.DBK64_ONLINE_READS !== "YES") {
      onlineWarning = "Online purchases are temporarily unavailable in the workflow. Please contact support.";
    } else {
      try {
        const source = await dbk65ListOnlineOrders(storeId || undefined);
        const eligible = source.filter((order) => order.paymentStatus === "paid" && order.status !== "delivered" && order.status !== "cancelled");
        const assignments = dbk134Enabled() ? await dbk134Assignments(eligible.map((order) => order.id)) : [];
        onlineOrders = eligible
          .map((order) => {
            const stage = dbk134Stage(order.status);
            const assigned = assignments.find((item) => item.order_id === order.id && item.stage === stage);
            return {
            id: order.id, orderNumber: order.orderNumber, reference: order.paymentReference || "",
            customerName: order.customerName, storeLocationId: order.storeLocationId || "",
            storeLocationName: order.storeLocationName || "", orderDate: order.createdAt,
            paymentStatus: order.paymentStatus, status: order.status,
            stockReady: !order.customerNote,
            total: order.total,
            items: order.lineItems.map((line) => ({name: line.name, quantity: line.quantity})),
            stage, assignedStaffId:assigned?.staff_id || "",assignedStaffName:assigned?.staff_name || "",
            channel:'ONLINE',
          }; }).filter((order) => manager || (order.assignedStaffId === staff.customerId && Boolean(order.stage)));
      } catch (error) {
        console.error("DBK133 Neon workflow read failed", error);
        onlineWarning = "Some paid online orders could not be loaded. Please refresh or contact support.";
      }
    }
  }

  // Provider-verified WhatsApp purchases are read from their original ledger;
  // no duplicate Sanity/commerce orders or stock movements are created.
  let whatsappOrders: Awaited<ReturnType<typeof dbk136ListWhatsappJobs>> = [];
  let whatsappWarning = '';
  if (dbk136Enabled()) {
    try {
      const source = await dbk136ListWhatsappJobs(storeId || undefined);
      const seenLegacy = new Set((orders as Array<{paymentReference?:string}>).map(x=>x.paymentReference).filter(Boolean));
      whatsappOrders = source.filter(job =>
        !seenLegacy.has(job.reference) && (manager || job.assignedStaffId === staff.customerId)
      );
      const names = new Map((storeLocations as Array<{_id:string;name:string}>).map(x=>[x._id,x.name]));
      whatsappOrders = whatsappOrders.map(job=>({...job,storeLocationName:names.get(job.storeLocationId)||'Assigned store'}));
    } catch(error) {
      console.error('WhatsApp workflow read failed',error);
      whatsappWarning='Some verified WhatsApp orders could not be loaded.';
    }
  }
  return NextResponse.json({
    orders, onlineOrders, whatsappOrders:whatsappOrders.map(({cartSnapshot,...job})=>job), whatsappWarning, whatsappEnabled:dbk136Enabled(),
    onlineWarning, onlineAssignmentsEnabled:dbk134Enabled(),
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
