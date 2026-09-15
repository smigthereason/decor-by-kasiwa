import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";

import { getApiStaff } from "@/lib/auth/api-authorization";
import { getCustomerByDocumentId, type StaffPermission } from "@/lib/auth/sanity-users";
import { FULFILMENT_STAGES, roleForStage, type FulfilmentStage } from "@/lib/operations/workflow";
import { serverClient } from "@/sanity/lib/serverClient";

const allowed = ["ADMIN", "STORE", "STORE_STAFF", "PRODUCTION_STAFF", "PACKAGING_STAFF", "DELIVERY_STAFF"] as const;
const permissionFor: Record<FulfilmentStage, StaffPermission> = { PRODUCTION: "PRODUCTION", PACKAGING: "PACKAGING", DELIVERY: "DELIVERY" };

type Order = { _id: string; orderNumber: string; currentFulfilmentStage?: FulfilmentStage | "COMPLETED"; fulfilmentStages?: FulfilmentStage[]; assignedStaffId?: string };
type WorkflowStaff = { _id: string; name: string; role: string; permissions?: string[] };

async function getEligibleStaff(staffId: string, stage: FulfilmentStage) {
  const person = await serverClient.fetch<WorkflowStaff | null>(
    `*[_type == "customerUser" && _id == $id && status == "ACTIVE"][0]{_id,name,role,permissions}`,
    { id: staffId },
    { cache: "no-store" },
  );
  if (!person || (person.role !== roleForStage(stage) && !person.permissions?.includes(permissionFor[stage]))) {
    throw new Error(`Selected staff member is not available for ${stage.toLowerCase()}.`);
  }
  return person;
}

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const staff = await getApiStaff([...allowed]);
  if (!staff.ok) return NextResponse.json({ message: "Access denied." }, { status: staff.status });
  try {
    const { id } = await params;
    const body = await request.json() as { action?: "assign_current"; staffId?: string; nextStaffId?: string };
    const order = await serverClient.fetch<Order | null>(
      `*[_type == "commerceOrder" && _id == $id][0]{_id,orderNumber,currentFulfilmentStage,fulfilmentStages,"assignedStaffId":assignedFulfilmentStaff._ref}`,
      { id }, { cache: "no-store" },
    );
    if (!order?.currentFulfilmentStage || order.currentFulfilmentStage === "COMPLETED") throw new Error("This sale has no active fulfilment stage.");
    const stage: FulfilmentStage = order.currentFulfilmentStage;
    const manager = staff.role === "ADMIN" || staff.role === "STORE";

    if (body.action === "assign_current") {
      if (!manager) return NextResponse.json({ message: "Only a manager or admin can assign the current workflow stage." }, { status: 403 });
      if (!body.staffId) throw new Error(`Select an available ${stage.toLowerCase()} staff member.`);
      const assigned = await getEligibleStaff(body.staffId, stage);
      const now = new Date().toISOString();
      await serverClient.patch(id).set({
        assignedFulfilmentStaff: { _type: "reference", _ref: assigned._id },
        assignedFulfilmentStaffName: assigned.name,
        status: "processing",
        updatedAt: now,
      }).commit();
      return NextResponse.json({ ok: true, currentStage: stage, assignedTo: assigned.name });
    }

    const viewer = await getCustomerByDocumentId(staff.customerId);
    const canComplete = manager || staff.role === roleForStage(stage) || viewer?.permissions?.includes(permissionFor[stage]);
    if (!canComplete) return NextResponse.json({ message: `Only ${stage.toLowerCase()} staff can complete this stage.` }, { status: 403 });
    if (!manager && (!order.assignedStaffId || order.assignedStaffId !== staff.customerId)) {
      return NextResponse.json({ message: "This job must be assigned to you before you can complete it." }, { status: 403 });
    }
    if (manager && !order.assignedStaffId) {
      return NextResponse.json({ message: `Assign the ${stage.toLowerCase()} stage before completing it.` }, { status: 400 });
    }

    const stages = FULFILMENT_STAGES.filter((value) => (order.fulfilmentStages || []).includes(value));
    const index = stages.indexOf(stage);
    const nextStage = index >= 0 ? stages[index + 1] : undefined;
    let nextStaff: WorkflowStaff | null = null;
    if (nextStage) {
      if (!body.nextStaffId) throw new Error(`Select an available ${nextStage.toLowerCase()} staff member before completing this stage.`);
      nextStaff = await getEligibleStaff(body.nextStaffId, nextStage);
    }

    const now = new Date().toISOString();
    const history = {
      _key: randomUUID().slice(0, 16), _type: "object", stage, completedAt: now,
      completedBy: { _type: "reference", _ref: staff.customerId }, completedByName: staff.customerName,
      ...(nextStaff ? { assignedNextTo: { _type: "reference", _ref: nextStaff._id }, assignedNextToName: nextStaff.name } : {}),
    };
    const patch = serverClient.patch(id).setIfMissing({ fulfilmentHistory: [] }).append("fulfilmentHistory", [history]).set({
      updatedAt: now,
      currentFulfilmentStage: nextStage || "COMPLETED",
      ...(nextStaff ? { assignedFulfilmentStaff: { _type: "reference", _ref: nextStaff._id }, assignedFulfilmentStaffName: nextStaff.name } : {}),
      ...(!nextStage && stage === "DELIVERY" ? { status: "delivered", deliveredAt: now } : !nextStage && stage === "PACKAGING" ? { status: "packed" } : { status: "processing" }),
    });
    if (!nextStaff) patch.unset(["assignedFulfilmentStaff", "assignedFulfilmentStaffName"]);
    await patch.commit();
    return NextResponse.json({ ok: true, nextStage: nextStage || "COMPLETED" });
  } catch (cause) {
    console.error("Workflow update failed:", cause);
    return NextResponse.json({ message: cause instanceof Error ? cause.message : "Unable to update fulfilment workflow." }, { status: 400 });
  }
}
