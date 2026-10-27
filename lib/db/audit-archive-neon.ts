import "server-only";

import { getNeonSql } from "@/lib/db/neon";
import { neonAuditReadsEnabled } from "@/lib/db/audit-write-neon";

// DBK-47: historical audit views. This module NEVER writes to either database.
// The DBK-46 archive is only a snapshot: new Sanity events must still be read.
export const auditArchiveReadsEnabled = () => process.env.DBK_AUDIT_ARCHIVE_READ === "1";

export type ArchivedAudit = {
  id: string;
  eventNumber: string;
  eventType: string;
  entityType?: string;
  entityId?: string;
  entityLabel?: string;
  actorName?: string;
  actorEmail?: string;
  actorRole?: string;
  detail?: string;
  createdAt: string;
  resolutionStatus?: "PENDING" | "RESOLVED";
  resolvedAt?: string;
  resolvedBy?: string;
};

export type ArchivedStaffSession = {
  _id: string;
  loginAt: string;
  lastSeenAt: string;
  logoutAt?: string;
  durationMinutes?: number;
  status?: "ACTIVE" | "ENDED";
  lastRoute?: string;
};

type ArchiveRow = { sanity_id: string; document_json: Record<string, unknown> };
function optString(obj: Record<string, unknown>, key: string) {
  const value = obj[key];
  return typeof value === "string" && value ? value : undefined;
}
function asAudit(row: ArchiveRow): ArchivedAudit {
  const data = row.document_json;
  return {
    id: row.sanity_id,
    eventNumber: optString(data, "eventNumber") || "",
    eventType: optString(data, "eventType") || "",
    ...(optString(data, "entityType") ? { entityType: optString(data,"entityType") } : {}),
    ...(optString(data, "entityId") ? { entityId: optString(data,"entityId") } : {}),
    ...(optString(data, "entityLabel") ? { entityLabel: optString(data,"entityLabel") } : {}),
    ...(optString(data, "actorName") ? { actorName: optString(data,"actorName") } : {}),
    ...(optString(data, "actorEmail") ? { actorEmail: optString(data,"actorEmail") } : {}),
    ...(optString(data, "actorRole") ? { actorRole: optString(data,"actorRole") } : {}),
    ...(optString(data, "detail") ? { detail: optString(data,"detail") } : {}),
    createdAt: optString(data,"createdAt") || optString(data,"_createdAt") || "",
    ...(optString(data,"resolutionStatus") ? { resolutionStatus: optString(data,"resolutionStatus") as "PENDING" | "RESOLVED" } : {}),
    ...(optString(data,"resolvedAt") ? { resolvedAt: optString(data,"resolvedAt") } : {}),
    ...(optString(data,"resolvedBy") ? { resolvedBy: optString(data,"resolvedBy") } : {}),
  };
}

export function mergeUniqueById<T extends {id:string;createdAt:string}>(...groups: T[][]): T[] {
  const unique = new Map<string,T>();
  // Later groups win, so live Sanity records override stale archived revisions.
  for (const group of groups) for (const item of group) unique.set(item.id,item);
  return [...unique.values()].sort((a,b)=> b.createdAt.localeCompare(a.createdAt));
}

export async function listArchivedAudits(limit=500,since?:string,actorId?:string): Promise<ArchivedAudit[]> {
  const sql = getNeonSql();
  const bounded = Math.max(1,Math.min(25000,limit));
  const date = since || null, actor = actorId?.replace(/^drafts\./,"") || null;
  const rows = await sql`
    SELECT sanity_id, document_json FROM public.dbk_sanity_operational_archive
    WHERE document_type = 'auditEvent'
      AND (${date}::text IS NULL OR COALESCE(document_json->>'createdAt', document_json->>'_createdAt','') >= ${date}::text)
      AND (${actor}::text IS NULL OR document_json->'actor'->>'_ref' = ${actor}::text)
    ORDER BY COALESCE(document_json->>'createdAt',document_json->>'_createdAt','') DESC, sanity_id DESC
    LIMIT ${bounded}`;
  const snapshots = (rows as ArchiveRow[]).map(asAudit);
  if (!neonAuditReadsEnabled()) return snapshots;

  // DBK-48A live events are authoritative for their own IDs. Historical
  // Sanity archive rows remain read-only and independently verifiable.
  const liveRows = await sql`
    SELECT id AS sanity_id, document_json FROM public.dbk_live_audit_events
    WHERE (${date}::text IS NULL OR created_at >= ${date}::timestamptz)
      AND (${actor}::text IS NULL OR document_json->'actor'->>'_ref' = ${actor}::text)
    ORDER BY created_at DESC, id DESC
    LIMIT ${bounded}`;
  return mergeUniqueById(snapshots, (liveRows as ArchiveRow[]).map(asAudit)).slice(0, bounded);
}

export async function archivedAuditIds(): Promise<string[]> {
  const sql=getNeonSql();
  const rows=await sql`SELECT sanity_id FROM public.dbk_sanity_operational_archive WHERE document_type='auditEvent'`;
  const archived=(rows as {sanity_id:string}[]).map(row=>row.sanity_id);
  if (!neonAuditReadsEnabled()) return archived;
  const live=await sql`SELECT id FROM public.dbk_live_audit_events`;
  return [...new Set([...archived,...(live as {id:string}[]).map(row=>row.id)])];
}

export async function getArchivedStaffHistory(staffId:string) {
  const sql=getNeonSql();
  const id=staffId.replace(/^drafts\./,"");
  const [sessionRows,audits]=await Promise.all([
    sql`SELECT sanity_id,document_json FROM public.dbk_sanity_operational_archive
        WHERE document_type='staffSession' AND document_json->'staff'->>'_ref' = ${id}
        ORDER BY document_json->>'loginAt' DESC LIMIT 120`,
    listArchivedAudits(150,undefined,id),
  ]);
  const sessions=(sessionRows as ArchiveRow[]).map(row=>{
    const d=row.document_json;
    return {
      _id:row.sanity_id,
      loginAt:optString(d,'loginAt') || '',
      lastSeenAt:optString(d,'lastSeenAt') || '',
      ...(optString(d,'logoutAt') ? {logoutAt:optString(d,'logoutAt')}:{}),
      ...(typeof d.durationMinutes === 'number' ? {durationMinutes:d.durationMinutes}:{}),
      ...(d.status==='ACTIVE'||d.status==='ENDED'?{status:d.status}:{}),
      ...(optString(d,'lastRoute') ? {lastRoute:optString(d,'lastRoute')}:{}),
    } as ArchivedStaffSession;
  });
  return {sessions,audits};
}
