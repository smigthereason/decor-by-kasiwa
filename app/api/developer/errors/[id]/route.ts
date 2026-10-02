import { getServerSession } from "next-auth";
import { NextResponse } from "next/server";

import { authOptions } from "@/lib/auth/options";
import { serverClient } from "@/sanity/lib/serverClient";

const DEVELOPER_EMAILS = new Set(["victor.dmaina@gmail.com", "kantonyk13@gmail.com"]);

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await getServerSession(authOptions);
  const email = session?.user?.email?.trim().toLowerCase();
  if (!email || !DEVELOPER_EMAILS.has(email)) return new NextResponse(null, { status: 404 });

  const { id } = await params;
  const body = (await request.json().catch(() => null)) as { resolved?: boolean } | null;
  if (!id || typeof body?.resolved !== "boolean") return NextResponse.json({ error: "Error 400" }, { status: 400 });

  const event = await serverClient.fetch<{ _id: string; eventType: string } | null>(
    `*[_type == "auditEvent" && _id == $id][0]{_id,eventType}`,
    { id },
    { cache: "no-store" },
  );
  if (!event || event.eventType !== "CLIENT_ERROR") return NextResponse.json({ error: "Error 404" }, { status: 404 });

  const now = new Date().toISOString();
  if (body.resolved) {
    await serverClient.patch(id).set({ resolutionStatus: "RESOLVED", resolvedAt: now, resolvedBy: email }).commit();
  } else {
    await serverClient.patch(id).set({ resolutionStatus: "PENDING" }).unset(["resolvedAt", "resolvedBy"]).commit();
  }
  return NextResponse.json({ success: true, status: body.resolved ? "RESOLVED" : "PENDING", resolvedAt: body.resolved ? now : null, resolvedBy: body.resolved ? email : null });
}
