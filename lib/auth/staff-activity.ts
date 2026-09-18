import "server-only";

import { createHash, randomUUID } from "node:crypto";

import type { ApiStaffRole } from "@/lib/auth/api-authorization";
import { recordAuditEvent } from "@/lib/pos/ledger";
import { serverClient } from "@/sanity/lib/serverClient";

const ONLINE_WINDOW_MS = 3 * 60 * 1000;
const MAX_ACTIVE_GAP_MS = 2.5 * 60 * 1000;
const EAT_OFFSET_MS = 3 * 60 * 60 * 1000;

type StaffActor = {
  id: string;
  name: string;
  email: string;
  role: ApiStaffRole;
};

type StaffSessionRecord = {
  _id: string;
  loginAt: string;
  lastSeenAt: string;
  logoutAt?: string;
  durationMinutes?: number;
  status?: "ACTIVE" | "ENDED";
  lastRoute?: string;
};

export type StaffActivityRecord = {
  id: string;
  eventNumber: string;
  eventType: string;
  entityType?: string;
  entityId?: string;
  entityLabel?: string;
  actorName?: string;
  actorRole?: string;
  detail?: string;
  createdAt: string;
};

function baseDocumentId(value: string) {
  return value.replace(/^drafts\./, "");
}

function hashId(value: string) {
  return createHash("sha256").update(value).digest("hex").slice(0, 32);
}

function sessionDocumentId(sessionId: string) {
  return `staffSession.${hashId(sessionId)}`;
}

function safeText(value: string | undefined, max = 180) {
  return (value || "").replace(/\s+/g, " ").trim().slice(0, max);
}

function minutesBetween(start: string, end: string) {
  const value = (new Date(end).getTime() - new Date(start).getTime()) / 60000;
  return Math.max(0, Math.round(value * 100) / 100);
}

function overlapMinutes(start: string, end: string, windowStart: number, windowEnd: number) {
  const startMs = Math.max(new Date(start).getTime(), windowStart);
  const endMs = Math.min(new Date(end).getTime(), windowEnd);
  if (endMs <= startMs) return 0;
  return (endMs - startMs) / 60000;
}

function activeIncrement(lastSeenAt: string | undefined, nowMs: number) {
  if (!lastSeenAt) return 0;
  const delta = nowMs - new Date(lastSeenAt).getTime();
  if (delta <= 0 || delta > MAX_ACTIVE_GAP_MS) return 0;
  return delta / 60000;
}

function windowActivityMinutes(session: StaffSessionRecord, windowStart: number, windowEnd: number) {
  const end = session.logoutAt || session.lastSeenAt || session.loginAt;
  const wallMinutes = Math.max(0, (new Date(end).getTime() - new Date(session.loginAt).getTime()) / 60000);
  const activeMinutes = session.durationMinutes ?? wallMinutes;
  if (wallMinutes <= 0) return 0;
  const overlap = overlapMinutes(session.loginAt, end, windowStart, windowEnd);
  return Math.min(activeMinutes, activeMinutes * (overlap / wallMinutes));
}

export async function touchStaffSession({
  sessionId,
  actor,
  route,
}: {
  sessionId: string;
  actor: StaffActor;
  route?: string;
}) {
  const id = sessionDocumentId(sessionId);
  const nowMs = Date.now();
  const now = new Date(nowMs).toISOString();
  const staffId = baseDocumentId(actor.id);
  const existing = await serverClient.fetch<StaffSessionRecord | null>(
    `*[_type == "staffSession" && _id == $id][0]{_id,loginAt,lastSeenAt,logoutAt,durationMinutes,status,lastRoute}`,
    { id },
    { cache: "no-store" },
  );
  const increment = existing?.status === "ACTIVE" ? activeIncrement(existing.lastSeenAt, nowMs) : 0;

  await serverClient.createIfNotExists({
    _id: id,
    _type: "staffSession",
    staff: { _type: "reference", _ref: staffId },
    staffName: actor.name,
    staffEmail: actor.email,
    staffRole: actor.role,
    sessionKey: hashId(sessionId),
    loginAt: now,
    lastSeenAt: now,
    durationMinutes: 0,
    status: "ACTIVE",
    lastRoute: safeText(route, 240),
    createdAt: now,
  });

  const patch = serverClient.patch(id).set({
    staff: { _type: "reference", _ref: staffId },
    staffName: actor.name,
    staffEmail: actor.email,
    staffRole: actor.role,
    lastSeenAt: now,
    status: "ACTIVE",
    ...(route ? { lastRoute: safeText(route, 240) } : {}),
  }).unset(["logoutAt"]);
  if (increment > 0) patch.inc({ durationMinutes: increment });
  await patch.commit();

  await recordAuditEvent({
    key: `staff-login|${sessionId}`,
    eventType: "STAFF_LOGIN",
    entityType: "staffSession",
    entityId: id,
    entityLabel: "Back-office sign in",
    actor: { id: staffId, name: actor.name, email: actor.email, role: actor.role },
    detail: route ? `Signed in and opened ${safeText(route, 240)}.` : "Signed in to the back office.",
    createdAt: now,
  });

  return id;
}

export async function recordStaffActivity({
  sessionId,
  actor,
  eventType,
  route,
  label,
}: {
  sessionId: string;
  actor: StaffActor;
  eventType: "STAFF_PAGE_VIEW" | "STAFF_INTERACTION";
  route?: string;
  label?: string;
}) {
  const sessionIdValue = await touchStaffSession({ sessionId, actor, route });
  const now = new Date().toISOString();
  const safeRoute = safeText(route, 240) || "Back office";
  const safeLabel = safeText(label, 160);
  await recordAuditEvent({
    key: `staff-activity|${sessionId}|${eventType}|${randomUUID()}`,
    eventType,
    entityType: "staffActivity",
    entityId: sessionIdValue,
    entityLabel: safeLabel || safeRoute,
    actor: { id: baseDocumentId(actor.id), name: actor.name, email: actor.email, role: actor.role },
    detail: eventType === "STAFF_PAGE_VIEW"
      ? `Viewed ${safeRoute}.`
      : `${safeLabel || "Used a control"} on ${safeRoute}.`,
    createdAt: now,
  });
}

export async function endStaffSession({
  sessionId,
  actor,
}: {
  sessionId: string;
  actor: StaffActor;
}) {
  const id = sessionDocumentId(sessionId);
  const existing = await serverClient.fetch<StaffSessionRecord | null>(
    `*[_type == "staffSession" && _id == $id][0]{_id,loginAt,lastSeenAt,logoutAt,durationMinutes,status,lastRoute}`,
    { id },
    { cache: "no-store" },
  );
  if (!existing || existing.status === "ENDED") return;

  const nowMs = Date.now();
  const now = new Date(nowMs).toISOString();
  const finalMinutes = (existing.durationMinutes || 0) + activeIncrement(existing.lastSeenAt, nowMs);
  await serverClient.patch(id).set({
    logoutAt: now,
    lastSeenAt: now,
    durationMinutes: Math.round(finalMinutes * 100) / 100,
    status: "ENDED",
  }).commit();

  await recordAuditEvent({
    key: `staff-logout|${sessionId}`,
    eventType: "STAFF_LOGOUT",
    entityType: "staffSession",
    entityId: id,
    entityLabel: "Back-office sign out",
    actor: { id: baseDocumentId(actor.id), name: actor.name, email: actor.email, role: actor.role },
    detail: "Signed out of the back office.",
    createdAt: now,
  });
}

export async function getStaffActivitySummary(staffId: string) {
  const id = baseDocumentId(staffId);
  const [sessions, activity] = await Promise.all([
    serverClient.fetch<StaffSessionRecord[]>(
      `*[_type == "staffSession" && staff._ref == $id] | order(loginAt desc)[0...120]{
        _id,loginAt,lastSeenAt,logoutAt,durationMinutes,status,lastRoute
      }`,
      { id },
      { cache: "no-store" },
    ),
    serverClient.fetch<StaffActivityRecord[]>(
      `*[_type == "auditEvent" && actor._ref == $id] | order(createdAt desc)[0...150]{
        "id":_id,eventNumber,eventType,entityType,entityId,entityLabel,actorName,actorRole,detail,createdAt
      }`,
      { id },
      { cache: "no-store" },
    ),
  ]);

  const now = Date.now();
  const shiftedNow = new Date(now + EAT_OFFSET_MS);
  shiftedNow.setUTCHours(0, 0, 0, 0);
  const todayStart = shiftedNow.getTime() - EAT_OFFSET_MS;
  const sevenDaysStart = now - 7 * 24 * 60 * 60 * 1000;

  let todayMinutes = 0;
  let sevenDayMinutes = 0;
  let lastSeenAt: string | undefined;
  let online = false;

  for (const session of sessions) {
    todayMinutes += windowActivityMinutes(session, todayStart, now);
    sevenDayMinutes += windowActivityMinutes(session, sevenDaysStart, now);
    if (!lastSeenAt || new Date(session.lastSeenAt).getTime() > new Date(lastSeenAt).getTime()) lastSeenAt = session.lastSeenAt;
    if (session.status === "ACTIVE" && now - new Date(session.lastSeenAt).getTime() <= ONLINE_WINDOW_MS) online = true;
  }

  return {
    summary: {
      online,
      lastSeenAt,
      todayMinutes: Math.round(todayMinutes),
      sevenDayMinutes: Math.round(sevenDayMinutes),
      loginCount: sessions.length,
    },
    sessions: sessions.map((session) => ({
      ...session,
      durationMinutes: session.durationMinutes ?? Math.round(minutesBetween(session.loginAt, session.logoutAt || session.lastSeenAt)),
      online: session.status === "ACTIVE" && now - new Date(session.lastSeenAt).getTime() <= ONLINE_WINDOW_MS,
    })),
    activity,
  };
}
