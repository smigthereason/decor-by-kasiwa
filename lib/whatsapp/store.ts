import 'server-only';
import { getNeonSql } from '@/lib/db/neon';
import type { InboundWhatsAppMessage } from './core';

export type QueuedWhatsAppMessage = {
  id: string; wa_id: string; message_text: string;
  message_type: 'text' | 'image' | 'unsupported'; media_id: string | null;
  attempts: number; mode: 'bot' | 'human'; display_name: string;
};

/** Persist before ACK. Meta redelivery uses its globally unique provider message ID. */
export async function recordIncoming(message: InboundWhatsAppMessage) {
  const sql = getNeonSql();
  const providerTime = message.timestamp ? Number(message.timestamp) : 0;
  // Use provider message time, not webhook redelivery time, for the service window.
  const eventTime = providerTime > 1_600_000_000 && providerTime < Date.now() / 1000 + 60
    ? new Date(providerTime * 1000).toISOString() : new Date().toISOString();
  await sql`INSERT INTO public.dbk36_wa_conversations (wa_id, display_name, last_inbound_at)
    VALUES (${message.from}, ${message.displayName}, ${eventTime}::timestamptz)
    ON CONFLICT (wa_id) DO UPDATE SET
      display_name=CASE WHEN EXCLUDED.display_name <> '' THEN EXCLUDED.display_name ELSE dbk36_wa_conversations.display_name END,
      last_inbound_at=GREATEST(dbk36_wa_conversations.last_inbound_at, EXCLUDED.last_inbound_at), updated_at=now()`;
  // A failed second statement triggers Meta retry; first upsert is safe to replay.
  await sql`INSERT INTO public.dbk36_wa_messages
    (wa_id, provider_message_id, direction, message_type, message_text, media_id)
    VALUES (${message.from}, ${message.messageId}, 'in', ${message.type}, ${message.text}, ${message.mediaId})
    ON CONFLICT (provider_message_id) DO NOTHING`;
}

/** Atomic cross-worker claim. Older messages in each conversation must be resolved first. */
export async function claimNextMessage(): Promise<QueuedWhatsAppMessage | null> {
  const sql = getNeonSql();
  const rows = await sql`
    WITH candidate AS (
      SELECT m.id FROM public.dbk36_wa_messages m
      WHERE m.direction='in' AND m.attempts < 5
        AND m.next_attempt_at <= now()
        AND (m.status='pending' OR (m.status='processing' AND m.claimed_at < now() - interval '3 minutes'))
        AND NOT EXISTS (
          SELECT 1 FROM public.dbk36_wa_messages old
          WHERE old.wa_id=m.wa_id AND old.direction='in'
            AND (old.created_at < m.created_at OR (old.created_at = m.created_at AND old.id < m.id))
            AND old.status IN ('pending','processing')
        )
      ORDER BY m.created_at, m.id LIMIT 1 FOR UPDATE SKIP LOCKED
    ), claimed AS (
      UPDATE public.dbk36_wa_messages m
        SET status='processing', attempts=attempts+1, claimed_at=now(), updated_at=now()
      FROM candidate WHERE m.id=candidate.id
      RETURNING m.id,m.wa_id,m.message_text,m.message_type,m.media_id,m.attempts
    )
    SELECT c.*, v.mode,v.display_name FROM claimed c
    JOIN public.dbk36_wa_conversations v ON v.wa_id=c.wa_id`;
  return (rows[0] as unknown as QueuedWhatsAppMessage) || null;
}

export async function getRecentConversation(waId: string) {
  const sql = getNeonSql();
  const rows = await sql`SELECT direction,message_text FROM public.dbk36_wa_messages
    WHERE wa_id=${waId} AND message_text <> '' AND status IN ('done','sent')
    ORDER BY created_at DESC LIMIT 6`;
  return rows.reverse().map(row => ({
    role: row.direction === 'in' ? 'customer' : 'assistant',
    text: String(row.message_text).slice(0, 500),
  }));
}

export async function setHumanMode(waId: string) {
  const sql = getNeonSql();
  await sql`UPDATE public.dbk36_wa_conversations SET mode='human', updated_at=now() WHERE wa_id=${waId}`;
}

export async function markProcessed(id: string, waId: string, reply: string | null, providerId: string | null) {
  const sql = getNeonSql();
  // The reply may have reached Meta even if DB recording fails. The retry
  // handler avoids intentional duplicate sends, but exactly-once send is not guaranteed.
  if (reply) {
    await sql`INSERT INTO public.dbk36_wa_messages
      (wa_id, provider_message_id, direction, message_type, message_text, status)
      VALUES (${waId}, ${providerId}, 'out', 'text', ${reply}, 'sent')
      ON CONFLICT (provider_message_id) DO NOTHING`;
    await sql`UPDATE public.dbk36_wa_conversations
      SET last_outbound_at=now(), updated_at=now() WHERE wa_id=${waId}`;
  }
  await sql`UPDATE public.dbk36_wa_messages SET status='done', claimed_at=NULL, updated_at=now()
    WHERE id=${id} AND status='processing'`;
}

export async function markRetry(id: string, attempts: number) {
  const sql = getNeonSql();
  const final = attempts >= 5;
  const delaySeconds = Math.min(600, 10 * 2 ** Math.max(0, attempts - 1));
  await sql`UPDATE public.dbk36_wa_messages
    SET status=${final ? 'failed' : 'pending'}, claimed_at=NULL,
      next_attempt_at=now() + (${delaySeconds} * interval '1 second'),
      last_error='message processing failed; inspect application logs', updated_at=now()
    WHERE id=${id} AND status='processing'`;
}

export async function getWhatsAppConversations(limit = 50) {
  const sql = getNeonSql();
  const rows = await sql`SELECT wa_id, display_name, mode, last_inbound_at, last_outbound_at,
    (SELECT COUNT(*)::int FROM public.dbk36_wa_messages m
      WHERE m.wa_id=c.wa_id AND m.direction='in' AND m.status='failed') AS failed_messages
    FROM public.dbk36_wa_conversations c ORDER BY updated_at DESC LIMIT ${Math.min(limit, 100)}`;
  return rows;
}

export async function getConversationMessages(waId: string, limit = 100) {
  const sql = getNeonSql();
  const rows = await sql`SELECT id,direction,message_type,message_text,media_id,status,created_at
    FROM public.dbk36_wa_messages WHERE wa_id=${waId}
    ORDER BY created_at DESC,id DESC LIMIT ${Math.min(limit, 100)}`;
  return rows.reverse();
}

export async function changeConversationMode(waId: string, mode: 'bot' | 'human') {
  const sql = getNeonSql();
  const rows = await sql`UPDATE public.dbk36_wa_conversations SET mode=${mode},updated_at=now()
    WHERE wa_id=${waId} RETURNING wa_id,mode`;
  return rows.length === 1;
}

/** WhatsApp Cloud API disallows free-form outbound outside the service window. */
export async function canSendManualReply(waId: string): Promise<boolean> {
  const sql = getNeonSql();
  const rows = await sql`SELECT (last_inbound_at > now() - interval '24 hours') AS allowed
    FROM public.dbk36_wa_conversations WHERE wa_id=${waId} LIMIT 1`;
  return rows[0]?.allowed === true;
}

export async function recordManualReply(waId: string, text: string, providerId: string) {
  const sql = getNeonSql();
  await sql`INSERT INTO public.dbk36_wa_messages
    (wa_id,provider_message_id,direction,message_type,message_text,status)
    VALUES (${waId},${providerId},'out','text',${text},'sent')
    ON CONFLICT (provider_message_id) DO NOTHING`;
  await sql`UPDATE public.dbk36_wa_conversations
    SET last_outbound_at=now(),updated_at=now() WHERE wa_id=${waId}`;
}

export async function isHumanConversation(waId: string): Promise<boolean> {
  const sql = getNeonSql();
  const rows = await sql`SELECT mode FROM public.dbk36_wa_conversations WHERE wa_id=${waId} LIMIT 1`;
  return rows[0]?.mode === 'human';
}
