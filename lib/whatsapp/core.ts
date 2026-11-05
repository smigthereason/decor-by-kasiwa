import { createHmac, timingSafeEqual } from 'node:crypto';

/** Pure DBK-36A protocol helpers. Do not import app secrets or remote clients here. */
export function safeMatch(left: string | null | undefined, right: string | null | undefined): boolean {
  if (!left || !right) return false;
  const a = Buffer.from(left);
  const b = Buffer.from(right);
  return a.length === b.length && timingSafeEqual(a, b);
}

export function verifyMetaSignature(body: string, signature: string | null, secret: string | undefined): boolean {
  if (!secret || !signature || !/^sha256=[a-f\d]{64}$/i.test(signature)) return false;
  const expected = createHmac('sha256', secret).update(body, 'utf8').digest('hex');
  return safeMatch(signature.toLowerCase(), `sha256=${expected}`);
}

export type InboundWhatsAppMessage = {
  messageId: string;
  from: string;
  displayName: string;
  type: 'text' | 'image' | 'unsupported';
  text: string;
  mediaId: string | null;
  timestamp: string | null;
};

type UnknownRecord = Record<string, unknown>;
const object = (value: unknown): UnknownRecord | null =>
  typeof value === 'object' && value !== null && !Array.isArray(value) ? value as UnknownRecord : null;
const list = (value: unknown): unknown[] => Array.isArray(value) ? value : [];
const string = (value: unknown): string => typeof value === 'string' ? value : '';

/** Only collect incoming messages; Meta sends status/delivery receipts on the same webhook. */
export function parseIncomingMessages(body: unknown, expectedPhoneNumberId: string): InboundWhatsAppMessage[] {
  const root = object(body);
  if (!root || root.object !== 'whatsapp_business_account') return [];
  const messages: InboundWhatsAppMessage[] = [];
  for (const entryValue of list(root.entry)) {
    const entry = object(entryValue);
    if (!entry) continue;
    for (const changeValue of list(entry.changes)) {
      const change = object(changeValue);
      if (!change || change.field !== 'messages') continue;
      const value = object(change.value);
      if (!value) continue;
      const metadata = object(value.metadata);
      if (string(metadata?.phone_number_id) !== expectedPhoneNumberId) continue;
      const names = new Map<string, string>();
      for (const contactValue of list(value.contacts)) {
        const contact = object(contactValue);
        const profile = object(contact?.profile);
        const waId = string(contact?.wa_id);
        if (waId) names.set(waId, string(profile?.name).slice(0, 120));
      }
      for (const messageValue of list(value.messages)) {
        const message = object(messageValue);
        if (!message) continue;
        const from = string(message.from);
        const id = string(message.id);
        if (!/^\d{7,16}$/.test(from) || !/^wamid\./.test(id) || id.length > 200) continue;
        const rawType = string(message.type);
        const image = object(message.image);
        const text = object(message.text);
        // Persist Meta interactive list/button replies in the existing text queue.
        // DBK-36-owned, opaque IDs are resolved against current Neon browse state.
        // No schema migration is necessary for interactive replies.
        const interactive = object(message.interactive);
        const reply = interactive?.type === 'button_reply' ? object(interactive.button_reply)
          : interactive?.type === 'list_reply' ? object(interactive.list_reply) : null;
        const replyId = string(reply?.id);
        const validAction = /^dbk36:[a-z0-9:]{1,100}$/.test(replyId);
        const type = rawType === 'text' || (rawType === 'interactive' && validAction) ? 'text'
          : rawType === 'image' ? 'image' : 'unsupported';
        const contents = rawType === 'interactive' && validAction ? replyId
          : type === 'text' ? string(text?.body) : type === 'image' ? string(image?.caption) : '';
        messages.push({
          messageId: id,
          from,
          displayName: names.get(from) || '',
          type,
          text: contents.slice(0, 4000),
          mediaId: type === 'image' ? string(image?.id).slice(0, 200) || null : null,
          timestamp: /^\d{10,13}$/.test(string(message.timestamp)) ? string(message.timestamp) : null,
        });
      }
    }
  }
  return messages.slice(0, 30);
}

export function wantsHuman(text: string): boolean {
  return /\b(human|real person|salesperson|talk to (a |an )?(person|agent)|speak to (a |an )?(person|agent)|customer service|staff member|representative)\b/i.test(text);
}

export function productSearchTerms(text: string): string[] {
  const stopwords = new Set(['hi','hello','hey','good','morning','afternoon','evening','please','show','me','have','you','any','for','the','and','with','about','want','need','looking','are','there','what','do','does','how','much','price','prices','cost','buy','order','can','in','of','a','an','is','to','i','your','products','product','items','available','stock','some']);
  return [...new Set(text.toLowerCase().match(/[a-z\d]{2,}/g) || [])].filter(w => !stopwords.has(w)).slice(0, 12);
}
