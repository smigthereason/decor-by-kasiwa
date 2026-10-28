import "server-only";
import { createHash } from "node:crypto";
import type { ApiStaffRole } from "@/lib/auth/api-authorization";
import { getNeonSql } from "@/lib/db/neon";

type Actor = { id: string; name: string; email: string; role: ApiStaffRole };
const hash = (s: string) => createHash("sha256").update(s).digest("hex");
const baseId = (s: string) => s.replace(/^drafts\./, "");
const clean = (s?: string, max = 180) => (s || "").replace(/\s+/g, " ").trim().slice(0, max);
const sessionIdFor = (s: string) => `staffSession.${hash(s).slice(0, 32)}`;
const eventIdFor = (s: string) => `auditEvent.${hash(s).slice(0, 24)}`;
const iso = (s: string | Date) => new Date(s).toISOString();

async function addEvent(input: {
  key: string; staffId: string; sessionId: string; eventType: "STAFF_LOGIN" | "STAFF_LOGOUT" | "CLIENT_ERROR";
  entityType: string; entityId: string; entityLabel: string; actor: Actor; detail: string; createdAt: string;
}) {
  const sql = getNeonSql();
  await sql`INSERT INTO dbk_staff_technical_events
     (id,staff_id,session_id,event_type,entity_type,entity_id,entity_label,actor_name,actor_role,detail,created_at)
     VALUES (${eventIdFor(input.key)},${input.staffId},${input.sessionId},${input.eventType},
       ${input.entityType},${input.entityId},${input.entityLabel},${input.actor.name},
       ${input.actor.role},${input.detail},${input.createdAt}::timestamptz)
     ON CONFLICT (id) DO NOTHING`;
}

export async function touchStaffSessionNeon({ sessionId, actor, route }: {
  sessionId: string; actor: Actor; route?: string;
}) {
  const sql = getNeonSql();
  const id = sessionIdFor(sessionId), key = hash(sessionId).slice(0,32);
  const staffId = baseId(actor.id), now = new Date().toISOString(), lastRoute = clean(route,240);
  const inserted = await sql`
    INSERT INTO dbk_staff_sessions
      (id,session_key,staff_id,staff_name,staff_email,staff_role,login_at,last_seen_at,status,last_route)
    VALUES (${id},${key},${staffId},${actor.name},${actor.email},${actor.role},
      ${now}::timestamptz,${now}::timestamptz,'ACTIVE',${lastRoute})
    ON CONFLICT (id) DO NOTHING RETURNING id`;
  if (inserted.length) {
    await addEvent({key:`staff-login|${sessionId}`,staffId,sessionId:id,eventType:"STAFF_LOGIN",
      entityType:"staffSession",entityId:id,entityLabel:"Back-office sign in",actor,
      detail:lastRoute?`Signed in and opened ${lastRoute}.`:"Signed in to the back office.",createdAt:now});
  } else {
    // Atomic update; out-of-order requests cannot reduce last_seen_at.
    await sql`UPDATE dbk_staff_sessions SET
      staff_id=${staffId},staff_name=${actor.name},staff_email=${actor.email},staff_role=${actor.role},
      duration_minutes=duration_minutes + CASE WHEN status='ACTIVE'
        AND ${now}::timestamptz > last_seen_at
        AND EXTRACT(EPOCH FROM (${now}::timestamptz-last_seen_at)) <= 150
        THEN ROUND((EXTRACT(EPOCH FROM (${now}::timestamptz-last_seen_at))/60)::numeric,2)
        ELSE 0 END,
      last_seen_at=GREATEST(last_seen_at,${now}::timestamptz),
      last_route=CASE WHEN ${lastRoute} <> '' THEN ${lastRoute} ELSE last_route END
      WHERE id=${id} AND status='ACTIVE'`;
  }
  return id;
}

export async function recordStaffActivityNeon(input: {
  sessionId: string; actor: Actor;
  eventType: "STAFF_PAGE_VIEW" | "STAFF_INTERACTION" | "CLIENT_ERROR";
  route?: string; label?: string; detail?: string;
}) {
  const id = await touchStaffSessionNeon(input);
  if(input.eventType!=="CLIENT_ERROR") return;
  const now = new Date().toISOString(), route=clean(input.route,240)||"Back office";
  const label=clean(input.label,160), detail=clean(input.detail,1000)||`Client error on ${route}.`;
  await addEvent({key:`client-error|${now.slice(0,10)}|${hash(`${route}|${label}|${detail}`).slice(0,32)}`,
    staffId:baseId(input.actor.id),sessionId:id,eventType:"CLIENT_ERROR",
    entityType:"staffActivity",entityId:id,entityLabel:label||route,
    actor:input.actor,detail,createdAt:now});
}

export async function endStaffSessionNeon({ sessionId,actor }: {sessionId:string;actor:Actor}) {
  const sql=getNeonSql(),id=sessionIdFor(sessionId),now=new Date().toISOString();
  const ended=await sql`UPDATE dbk_staff_sessions SET
    duration_minutes=duration_minutes + CASE WHEN ${now}::timestamptz > last_seen_at
      AND EXTRACT(EPOCH FROM (${now}::timestamptz-last_seen_at)) <= 150
      THEN ROUND((EXTRACT(EPOCH FROM (${now}::timestamptz-last_seen_at))/60)::numeric,2)
      ELSE 0 END,
    last_seen_at=GREATEST(last_seen_at,${now}::timestamptz),logout_at=${now}::timestamptz,status='ENDED'
    WHERE id=${id} AND status='ACTIVE' RETURNING id`;
  if(!ended.length)return;
  await addEvent({key:`staff-logout|${sessionId}`,staffId:baseId(actor.id),sessionId:id,
    eventType:"STAFF_LOGOUT",entityType:"staffSession",entityId:id,
    entityLabel:"Back-office sign out",actor,detail:"Signed out of the back office.",createdAt:now});
}

type SessionRow={id:string;login_at:Date|string;last_seen_at:Date|string;logout_at:Date|string|null;
  duration_minutes:string|number;status:"ACTIVE"|"ENDED";last_route:string|null};
type EventRow={id:string;event_type:string;entity_type:string|null;entity_id:string|null;
  entity_label:string|null;actor_name:string|null;actor_role:string|null;detail:string|null;created_at:Date|string};
export async function getStaffActivityFromNeon(staffId:string) {
  const sql=getNeonSql(),id=baseId(staffId);
  const [sessions,events]=await Promise.all([
    sql`SELECT id,login_at,last_seen_at,logout_at,duration_minutes,status,last_route
        FROM dbk_staff_sessions WHERE staff_id=${id} ORDER BY login_at DESC LIMIT 120`,
    sql`SELECT id,event_type,entity_type,entity_id,entity_label,actor_name,actor_role,detail,created_at
        FROM dbk_staff_technical_events WHERE staff_id=${id} ORDER BY created_at DESC LIMIT 150`,
  ]);
  return {
    sessions:(sessions as SessionRow[]).map(s=>({
      _id:s.id,loginAt:iso(s.login_at),lastSeenAt:iso(s.last_seen_at),
      ...(s.logout_at?{logoutAt:iso(s.logout_at)}:{}),
      durationMinutes:Number(s.duration_minutes),status:s.status,
      ...(s.last_route?{lastRoute:s.last_route}:{})
    })),
    activity:(events as EventRow[]).map(e=>({
      id:e.id,eventNumber:`AUD-${e.id.replace(/^auditEvent\./,"").slice(0,12).toUpperCase()}`,
      eventType:e.event_type,entityType:e.entity_type||undefined,entityId:e.entity_id||undefined,
      entityLabel:e.entity_label||undefined,actorName:e.actor_name||undefined,
      actorRole:e.actor_role||undefined,detail:e.detail||undefined,createdAt:iso(e.created_at)
    }))
  };
}
