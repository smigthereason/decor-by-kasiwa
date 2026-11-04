import 'server-only';
import { getNeonSql } from '@/lib/db/neon';
import { serverClient } from '@/sanity/lib/serverClient';
import {
  dbk95AuditEnabled,dbk95AuditDocument,dbk95AuditHash,
  dbk95ValidateEntry,type Dbk95AuditEntry,
} from '@/lib/pos/dbk95-transaction-audit';

/** DBK-95 projects *committed* Sanity order audit journals to existing Neon
 * live audit table. Does not update stock, orders, receivables, or payments. */
export async function dbk95ProjectOrder(orderId:string) {
  if (!dbk95AuditEnabled()) return {disabled:true,projected:0};
  if (!/^[-A-Za-z0-9_.]{4,180}$/.test(orderId)) throw new Error('Invalid DBK-95 order id');
  const order=await serverClient.fetch<{_id:string;dbk95AuditJournal?:Dbk95AuditEntry[]}|null>(
    `*[_type=='commerceOrder' && _id==$id][0]{_id,dbk95AuditJournal}`,
    {id:orderId},{cache:'no-store'});
  if(!order) throw new Error('Missing committed DBK-95 order journal');
  const journal=order.dbk95AuditJournal||[];
  if(journal.length>200) throw new Error('Excessive DBK-95 journal length');
  const seen=new Map<string,string>();
  const sql=getNeonSql();
  for(const entry of journal) {
    dbk95ValidateEntry(entry,orderId);
    const hash=dbk95AuditHash(entry);
    if(seen.has(entry.auditId)) {
      if(seen.get(entry.auditId)!==hash) throw new Error('Conflicting DBK-95 duplicate journal');
      continue;
    }
    seen.set(entry.auditId,hash);
    const document=JSON.stringify(dbk95AuditDocument(entry));
    await sql`INSERT INTO public.dbk_live_audit_events
      (id,payload_hash,document_json,created_at)
      VALUES (${entry.auditId},${hash},${document}::jsonb,${entry.createdAt}::timestamptz)
      ON CONFLICT (id) DO NOTHING`;
    const row=await sql`SELECT payload_hash FROM public.dbk_live_audit_events WHERE id=${entry.auditId}`;
    if(row.length!==1 || row[0].payload_hash!==hash)
      throw new Error('DBK-95 audit projection conflict; operator review required');
  }
  return {disabled:false,projected:seen.size};
}
/** Never convert a successfully committed payment into a reported failure. */
export async function dbk95ProjectAfterCommit(orderId:string) {
  if (!dbk95AuditEnabled()) return;
  try { await dbk95ProjectOrder(orderId); }
  catch(cause) {
    console.error('[DBK95] AUDIT_JOURNAL_NEEDS_REPLAY',{
      orderId,reason:cause instanceof Error?cause.message:'unknown'});
  }
}
