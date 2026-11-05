import 'server-only';
import { handleSalesFlow } from './browse-flow';
import type { WhatsAppInteractive } from './interactive-core';
import { isAllowedWhatsAppRecipient } from './production-policy';
import {
  claimNextMessage, markProcessed,
  markRetry, setHumanMode, canSendManualReply, isHumanConversation,
} from './store';

function settings() {
  const phoneId = process.env.WHATSAPP_PHONE_NUMBER_ID?.trim();
  const accessToken = process.env.WHATSAPP_ACCESS_TOKEN?.trim();
  const version = process.env.WHATSAPP_GRAPH_VERSION?.trim();
  if (!phoneId || !accessToken || !/^v\d+\.\d+$/.test(version || '')) {
    throw new Error('WhatsApp outbound configuration is incomplete');
  }
  return { phoneId, accessToken, version: version! };
}

type OutboundMessage =
  | { messaging_product: 'whatsapp'; to: string; type: 'text'; text: { preview_url: boolean; body: string } }
  | { messaging_product: 'whatsapp'; to: string; type: 'interactive'; interactive: WhatsAppInteractive };

/** One Graph API send per inbound action; preserve the existing test-recipient allowlist. */
async function sendMessage(to: string, payload: OutboundMessage): Promise<string> {
  if (!isAllowedWhatsAppRecipient(to, process.env)) {
    throw new Error('DBK-36 outbound blocked: recipient not approved for testing');
  }
  const { phoneId, accessToken, version } = settings();
  const url = `https://graph.facebook.com/${version}/${encodeURIComponent(phoneId)}/messages`;
  const send = (body: OutboundMessage) => fetch(url, {
    method: 'POST',
    headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(12000),
  });
  let result = await send(payload);
  // If Meta explicitly rejects an image header, retry the *same* interactive
  // buttons without the header. Never retry a 5xx/timeout here: uncertain delivery.
  if (result.status === 400 && payload.type === 'interactive'
      && payload.interactive.type === 'button' && payload.interactive.header?.type === 'image') {
    const withoutImage: WhatsAppInteractive = {
      type: 'button', body: payload.interactive.body,
      ...(payload.interactive.footer ? { footer: payload.interactive.footer } : {}),
      action: payload.interactive.action,
    };
    result = await send({ ...payload, interactive: withoutImage });
  }
  if (!result.ok) {
    // Meta error bodies might include customer identifiers; never log them.
    console.error('[DBK-36] Meta send failed', result.status);
    throw new Error(`Meta send failed (${result.status})`);
  }
  const data = await result.json() as { messages?: Array<{ id?: string }> };
  const id = data.messages?.[0]?.id;
  if (!id) throw new Error('Meta sent no message ID');
  return id;
}

export async function sendWhatsAppText(to: string, text: string): Promise<string> {
  return sendMessage(to, {
    messaging_product: 'whatsapp', to, type: 'text', text: { preview_url: false, body: text },
  });
}

async function sendWhatsAppFlowReply(to: string, reply: string, interactive?: WhatsAppInteractive): Promise<string> {
  return interactive
    ? sendMessage(to, { messaging_product: 'whatsapp', to, type: 'interactive', interactive })
    : sendWhatsAppText(to, reply);
}

/** Run a small, claim-locked batch; safe for concurrent webhook jobs or a cron recovery pass. */
export async function processWhatsAppQueue(limit = 2): Promise<{ processed: number; failed: number }> {
  if (process.env.WHATSAPP_BOT_ENABLED !== 'YES') return { processed: 0, failed: 0 };
  settings(); // Fail closed, before taking an inbox claim.
  const result = { processed: 0, failed: 0 };
  for (let i = 0; i < Math.min(limit, 8); i++) {
    const message = await claimNextMessage();
    if (!message) break;
    try {
      if (message.mode === 'human' || !await canSendManualReply(message.wa_id)) {
        // Staff owns this chat; do not overwrite their replies.
        await markProcessed(message.id, message.wa_id, null, null);
        result.processed++;
        continue;
      }
      let reply: string;
      let interactive: WhatsAppInteractive | undefined;
      let requestedHandover = false;
      if (message.message_type === 'image') {
        await setHumanMode(message.wa_id);
        reply = 'Thanks for sharing the photo. I’ve marked your photo enquiry for staff review. A team member can discuss your request here when available.';
      } else if (message.message_type !== 'text') {
        reply = 'I can help with text enquiries and products. For voice notes, documents or special requests, please ask to speak with our team.';
      } else {
        const flow = await handleSalesFlow(message.wa_id, message.message_text);
        requestedHandover = flow.handover;
        interactive = flow.interactive;
        if (requestedHandover) await setHumanMode(message.wa_id);
        reply = flow.reply;
      }
      // Staff may have taken over while the model was preparing the answer.
      if (await isHumanConversation(message.wa_id) && !requestedHandover && message.message_type !== 'image') {
        await markProcessed(message.id, message.wa_id, null, null);
        result.processed++;
        continue;
      }
      const providerId = await sendWhatsAppFlowReply(message.wa_id, reply, interactive);
      await markProcessed(message.id, message.wa_id, reply, providerId);
      result.processed++;
    } catch (error) {
      console.error('[DBK-36] Queue processing error', error instanceof Error ? error.message : 'unknown');
      await markRetry(message.id, message.attempts);
      result.failed++;
    }
  }
  return result;
}
