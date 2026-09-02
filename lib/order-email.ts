import "server-only";

import { serverClient } from "@/sanity/lib/serverClient";

const RESEND_API = "https://api.resend.com/emails";

type OrderEmailItem = {
  name: string;
  quantity: number;
  unitPrice: number;
  finish?: string;
  size?: string;
};

type OrderEmailInput = {
  orderId: string;
  orderNumber: string;
  customerName: string;
  customerEmail: string;
  deliveryLocation?: string;
  subtotal: number;
  deliveryFee: number;
  total: number;
  paymentMethod: string;
  items: OrderEmailItem[];
};

function money(value: number) {
  return `KES ${Number(value || 0).toLocaleString("en-KE", { maximumFractionDigits: 2 })}`;
}

function escapeHtml(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function getEmailConfig() {
  const apiKey = process.env.RESEND_API_KEY?.trim();
  const from = process.env.ORDER_EMAIL_FROM?.trim();
  const replyTo = process.env.ORDER_EMAIL_REPLY_TO?.trim();

  if (!apiKey) throw new Error("RESEND_API_KEY is missing; customer order confirmation email was not sent.");
  if (!from) throw new Error("ORDER_EMAIL_FROM is missing; customer order confirmation email was not sent.");
  return { apiKey, from, replyTo };
}

export async function sendOrderConfirmationEmail(input: OrderEmailInput) {
  const { apiKey, from, replyTo } = getEmailConfig();
  const rows = input.items.map((item) => {
    const details = [item.finish, item.size].filter(Boolean).join(" · ");
    return `
      <tr>
        <td style="padding:12px 0;border-bottom:1px solid #e7e4dc;">
          <strong>${escapeHtml(item.name)}</strong>${details ? `<br><span style="color:#6f746f;font-size:12px;">${escapeHtml(details)}</span>` : ""}
        </td>
        <td style="padding:12px 0;border-bottom:1px solid #e7e4dc;text-align:center;">${item.quantity}</td>
        <td style="padding:12px 0;border-bottom:1px solid #e7e4dc;text-align:right;">${money(item.unitPrice * item.quantity)}</td>
      </tr>`;
  }).join("");

  const html = `
    <div style="font-family:Arial,Helvetica,sans-serif;background:#f7f4ec;padding:32px;color:#17372f;">
      <div style="max-width:680px;margin:0 auto;background:#fff;padding:32px;border-radius:18px;">
        <p style="margin:0 0 8px;font-size:12px;letter-spacing:.12em;text-transform:uppercase;color:#6f746f;">Decor by Kasiwa</p>
        <h1 style="margin:0 0 16px;font-size:28px;">Order confirmed</h1>
        <p style="line-height:1.6;">Hi ${escapeHtml(input.customerName || "there")}, your payment has been received and order <strong>${escapeHtml(input.orderNumber)}</strong> is confirmed.</p>
        <table style="width:100%;border-collapse:collapse;margin-top:24px;font-size:14px;">
          <thead><tr><th style="text-align:left;padding-bottom:8px;">Item</th><th style="text-align:center;padding-bottom:8px;">Qty</th><th style="text-align:right;padding-bottom:8px;">Amount</th></tr></thead>
          <tbody>${rows}</tbody>
        </table>
        <div style="margin-top:24px;border-top:1px solid #e7e4dc;padding-top:16px;font-size:14px;line-height:1.8;">
          <div style="display:flex;justify-content:space-between;"><span>Subtotal</span><strong>${money(input.subtotal)}</strong></div>
          <div style="display:flex;justify-content:space-between;"><span>Delivery</span><strong>${money(input.deliveryFee)}</strong></div>
          <div style="display:flex;justify-content:space-between;font-size:17px;margin-top:8px;"><span>Total paid</span><strong>${money(input.total)}</strong></div>
        </div>
        <div style="margin-top:24px;background:#f7f4ec;padding:16px;border-radius:12px;font-size:13px;line-height:1.6;">
          <strong>Payment:</strong> ${escapeHtml(input.paymentMethod)}<br>
          <strong>Delivery:</strong> ${escapeHtml(input.deliveryLocation || "Delivery details captured with the order")}
        </div>
      </div>
    </div>`;

  const response = await fetch(RESEND_API, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from,
      to: [input.customerEmail],
      subject: `Order ${input.orderNumber} confirmed — Decor by Kasiwa`,
      html,
      ...(replyTo ? { reply_to: replyTo } : {}),
    }),
  });

  const payload = await response.json().catch(() => ({})) as { message?: string };
  if (!response.ok) {
    throw new Error(payload.message || `Order confirmation email failed with HTTP ${response.status}.`);
  }

  await serverClient.patch(input.orderId).set({ orderConfirmationEmailSentAt: new Date().toISOString() }).commit();
}
