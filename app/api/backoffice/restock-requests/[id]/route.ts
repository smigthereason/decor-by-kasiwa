import { NextRequest, NextResponse } from "next/server";

import { getApiStaff } from "@/lib/auth/api-authorization";
import type { RestockRequestStatus } from "@/lib/operations/types";
import { serverClient } from "@/sanity/lib/serverClient";

const statuses: RestockRequestStatus[] = ["open", "acknowledged", "resolved"];

export async function PATCH(
  request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  const staff = await getApiStaff(["ADMIN", "STORE"]);

  if (!staff.ok) {
    return NextResponse.json({ message: "Access denied." }, { status: staff.status });
  }

  const { id } = await context.params;
  const requestId = decodeURIComponent(id);
  const body = (await request.json()) as { status?: RestockRequestStatus };

  if (!body.status || !statuses.includes(body.status)) {
    return NextResponse.json({ message: "Valid request status is required." }, { status: 400 });
  }

  try {
    const row = await serverClient.fetch<{ _id: string; _rev: string; status?: RestockRequestStatus } | null>(
      `*[_type == "restockRequest" && _id == $id][0]{_id, _rev, status}`,
      { id: requestId },
      { cache: "no-store" },
    );

    if (!row) {
      return NextResponse.json({ message: "Restock alert not found." }, { status: 404 });
    }

    if (row.status === "resolved" && body.status !== "resolved") {
      return NextResponse.json({ message: "Resolved restock alerts cannot be reopened here." }, { status: 409 });
    }

    const now = new Date().toISOString();
    const set: Record<string, unknown> = {
      status: body.status,
      updatedAt: now,
    };

    if (body.status === "resolved") {
      set.resolvedAt = now;
      set.resolvedBy = { _type: "reference", _ref: staff.customerId };
      set.resolvedByName = staff.customerName;
    }

    await serverClient.patch(row._id).ifRevisionId(row._rev).set(set).commit();
    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("Restock request update failed:", error);
    return NextResponse.json({ message: "Restock alert could not be updated." }, { status: 500 });
  }
}
