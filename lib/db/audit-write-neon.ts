import "server-only";

import { createHash } from "node:crypto";

import { getNeonSql } from "@/lib/db/neon";

/**
 * DBK-48A: Independent operational audit writes only.
 * DO NOT use this for audit documents created inside a Sanity transaction:
 * stock/order/payment state transitions must remain atomic with their audit.
 */
export const neonAuditWritesEnabled = () => process.env.DBK_AUDIT_WRITE_BACKEND === "neon";
export const neonAuditReadsEnabled = () => neonAuditWritesEnabled() || process.env.DBK_AUDIT_LIVE_READ === "1";

const digest = (value: string) => createHash("sha256").update(value).digest("hex");

export type IndependentAuditInput = {
  key: string;
  eventType: string;
  entityType: string;
  entityId: string;
  entityLabel: string;
  actor?: { id: string; name: string; role: string };
  detail?: string;
  createdAt: string;
};

export async function recordIndependentAuditInNeon(input: IndependentAuditInput): Promise<string> {
  if (process.env.DBK_AUDIT_ARCHIVE_READ !== "1") {
    throw new Error("Enable DBK_AUDIT_ARCHIVE_READ=1 before Neon audit writes so audit history remains readable.");
  }
  if (!input.key.trim() || !input.eventType.trim() || !input.entityId.trim()) {
    throw new Error("An audit key, event type, and entity ID are required.");
  }
  if (!Number.isFinite(Date.parse(input.createdAt))) {
    throw new Error("Invalid audit timestamp.");
  }

  // Matches recordAuditEvent()'s historical Sanity identifier exactly.
  const suffix = digest(input.key).slice(0, 24);
  const id = `auditEvent.${suffix}`;
  const eventNumber = `AUD-${suffix.slice(0, 12).toUpperCase()}`;
  // Exclude generated timestamps so a retry retains its request identity.
  const payloadHash = digest(JSON.stringify([
    input.eventType, input.entityType, input.entityId, input.entityLabel,
    input.actor?.id || "", input.actor?.name || "", input.actor?.role || "",
    input.detail || "",
  ]));
  const document = {
    _id: id, _type: "auditEvent", eventNumber,
    eventType: input.eventType,
    entityType: input.entityType,
    entityId: input.entityId,
    entityLabel: input.entityLabel,
    ...(input.actor ? {
      actor: { _type: "reference", _ref: input.actor.id },
      actorName: input.actor.name,
      actorRole: input.actor.role,
    } : {}),
    ...(input.detail !== undefined ? { detail: input.detail } : {}),
    createdAt: input.createdAt,
  };

  const sql = getNeonSql();
  await sql`INSERT INTO public.dbk_live_audit_events
    (id, payload_hash, document_json, created_at)
    VALUES (${id}, ${payloadHash}, ${JSON.stringify(document)}::jsonb, ${input.createdAt}::timestamptz)
    ON CONFLICT (id) DO NOTHING`;

  const found = await sql`SELECT payload_hash FROM public.dbk_live_audit_events WHERE id = ${id}`;
  if (!found.length) {
    throw new Error("Audit write could not be verified. Inspect Neon before retrying.");
  }
  if (found[0].payload_hash !== payloadHash) {
    throw new Error("Audit idempotency-key conflict: the same key was reused for a different event.");
  }
  return id;
}
