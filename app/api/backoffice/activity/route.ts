import { NextResponse } from "next/server";

import { getApiStaff } from "@/lib/auth/api-authorization";
import { endStaffSession, recordStaffActivity, touchStaffSession } from "@/lib/auth/staff-activity";

export const dynamic = "force-dynamic";

const allowed = ["ADMIN", "STORE", "STORE_STAFF", "PRODUCTION_STAFF", "PACKAGING_STAFF", "DELIVERY_STAFF"] as const;

type ActivityInput = {
  action?: "HEARTBEAT" | "PAGE_VIEW" | "INTERACTION" | "LOGOUT";
  sessionId?: string;
  route?: string;
  label?: string;
};

export async function POST(request: Request) {
  const staff = await getApiStaff([...allowed]);
  if (!staff.ok) return NextResponse.json({ message: "Access denied." }, { status: staff.status });

  try {
    const body = await request.json() as ActivityInput;
    const sessionId = body.sessionId?.trim() || "";
    if (sessionId.length < 8 || sessionId.length > 160) {
      return NextResponse.json({ message: "Invalid activity session." }, { status: 400 });
    }

    const actor = {
      id: staff.customerId,
      name: staff.customerName,
      email: staff.customerEmail,
      role: staff.role,
    };

    if (body.action === "LOGOUT") {
      await endStaffSession({ sessionId, actor });
      return NextResponse.json({ ok: true });
    }

    if (body.action === "PAGE_VIEW" || body.action === "INTERACTION") {
      await recordStaffActivity({
        sessionId,
        actor,
        eventType: body.action === "PAGE_VIEW" ? "STAFF_PAGE_VIEW" : "STAFF_INTERACTION",
        route: body.route,
        label: body.label,
      });
      return NextResponse.json({ ok: true });
    }

    await touchStaffSession({ sessionId, actor, route: body.route });
    return NextResponse.json({ ok: true });
  } catch (cause) {
    console.error("Staff activity tracking failed:", cause);
    return NextResponse.json({ message: "Unable to record staff activity." }, { status: 400 });
  }
}
