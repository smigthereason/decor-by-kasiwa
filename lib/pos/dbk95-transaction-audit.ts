import "server-only";
import { createHash } from "node:crypto";
import { serverClient } from "@/sanity/lib/serverClient";

// DBK-95: append audit evidence to the SAME Sanity transaction as its
// money/stock/order mutation. The order is the durable recovery source.
// Standalone audit documents are not created when this feature is active.
export type Dbk95AuditEntry = {
  _type: "dbk95AuditEntry";
  _key: string;
  key: string;
  auditId: string;
  eventNumber: string;
  eventType: string;
  entityType: "commerceOrder";
  entityId: string;
  entityLabel: string;
  actorId?: string;
  actorName?: string;
  actorRole?: string;
  detail: string;
  createdAt: string;
};
const PROD_HOST = "ep-steep-scene-bausr4ct-pooler.c-8.eu-central-1.aws.neon.tech";
const sha = (v: string) => createHash("sha256").update(v).digest("hex");
export function dbk95AuditEnabled(): boolean {
  if (process.env.DBK95_TRANSACTION_AUDIT_STORE !== "neon") return false;
  if (process.env.DBK95_TRANSACTION_AUDIT_APPROVED !== "YES")
    throw new Error("DBK-95 transactional audit cutover is not approved");
  if (process.env.DBK_AUDIT_ARCHIVE_READ !== "1" ||
      process.env.DBK_AUDIT_LIVE_READ !== "1" ||
      process.env.DBK_AUDIT_WRITE_BACKEND !== "neon")
    throw new Error("DBK-95 needs existing Neon live audit reads and writes enabled");
  const raw = process.env.DATABASE_URL;
  if (!raw) throw new Error("DBK-95 DATABASE_URL is missing");
  const db = new URL(raw);
  if (!['postgres:', 'postgresql:'].includes(db.protocol) ||
      db.hostname !== PROD_HOST || db.pathname !== '/neondb' ||
      process.env.NEXT_PUBLIC_SANITY_PROJECT_ID !== 'g34n810u' ||
      (process.env.NEXT_PUBLIC_SANITY_DATASET || 'production') !== 'production')
    throw new Error('DBK-95 production identity mismatch');
  return true;
}
export function dbk95PosAuditEntry(input: {
  key:string; eventType:string; entityId:string; entityLabel:string;
  seller:{id:string;name:string;role:string}; detail:string; now:string;
}): Dbk95AuditEntry {
  const suffix = sha(input.key).slice(0,24);
  return {
    _type:'dbk95AuditEntry', _key:suffix, key:input.key,
    auditId:`auditEvent.${suffix}`,
    eventNumber:`AUD-${suffix.slice(0,12).toUpperCase()}`,
    eventType:input.eventType, entityType:'commerceOrder',
    entityId:input.entityId, entityLabel:input.entityLabel,
    actorId:input.seller.id, actorName:input.seller.name,
    actorRole:input.seller.role, detail:input.detail, createdAt:input.now,
  };
}
export function dbk95OnlineAuditEntry(input: {
  reference:string; idSuffix:string; entityId:string; entityLabel:string;
  detail:string; now:string;
}): Dbk95AuditEntry {
  return {
    _type:'dbk95AuditEntry',_key:sha(`online|${input.reference}`).slice(0,24),
    key:`online|${input.reference}`,
    auditId:`auditEvent.online-${input.idSuffix}`,
    eventNumber:`AUD-ONLINE-${input.idSuffix.slice(-10).toUpperCase()}`,
    eventType:'ONLINE_PAYMENT_CONFIRMED',entityType:'commerceOrder',
    entityId:input.entityId,entityLabel:input.entityLabel,
    actorName:'Online Shop',actorRole:'CUSTOMER',
    detail:input.detail,createdAt:input.now,
  };
}
export function dbk95AppendAudit(
  patch: ReturnType<typeof serverClient.patch>, entry:Dbk95AuditEntry,
) {
  return patch.setIfMissing({dbk95AuditJournal:[]})
    .append('dbk95AuditJournal',[entry]);
}
export function dbk95AuditDocument(entry:Dbk95AuditEntry) {
  return {
    _id:entry.auditId, _type:'auditEvent',eventNumber:entry.eventNumber,
    eventType:entry.eventType,entityType:entry.entityType,
    entityId:entry.entityId,entityLabel:entry.entityLabel,
    ...(entry.actorId ? {actor:{_type:'reference',_ref:entry.actorId}} : {}),
    ...(entry.actorName ? {actorName:entry.actorName} : {}),
    ...(entry.actorRole ? {actorRole:entry.actorRole} : {}),
    detail:entry.detail,createdAt:entry.createdAt,
  };
}
export function dbk95AuditHash(entry:Dbk95AuditEntry) {
  return sha(JSON.stringify([
    entry.eventType,entry.entityType,entry.entityId,entry.entityLabel,
    entry.actorId||'',entry.actorName||'',entry.actorRole||'',entry.detail,
  ]));
}
export function dbk95ValidateEntry(entry:Dbk95AuditEntry,orderId:string) {
  if (!entry || entry._type!=='dbk95AuditEntry' ||
      entry.entityType!=='commerceOrder' || entry.entityId!==orderId ||
      !entry.key || !entry.eventType || !entry.auditId ||
      !Number.isFinite(Date.parse(entry.createdAt)) ||
      !/^auditEvent\.[A-Za-z0-9.-]+$/.test(entry.auditId) ||
      entry.detail.length>5000) throw new Error('Invalid DBK-95 audit journal');
  if (entry.key.startsWith('online|')) {
    if (!entry.auditId.startsWith('auditEvent.online-')) throw new Error('Invalid online audit id');
  } else if (entry.auditId !== `auditEvent.${sha(entry.key).slice(0,24)}`) {
    throw new Error('Invalid POS audit id');
  }
}
