import "server-only";

import { sendSmtpEmail } from "@/lib/email/smtp";
import { serverClient } from "@/sanity/lib/serverClient";

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

export async function sendOrderConfirmationEmail(input: OrderEmailInput) {
  const from = process.env.ORDER_EMAIL_FROM?.trim() || process.env.SMTP_FROM?.trim();
  const replyTo = process.env.ORDER_EMAIL_REPLY_TO?.trim() || process.env.EMAIL_REPLY_TO?.trim();
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

  await sendSmtpEmail({
    to: input.customerEmail,
    ...(from ? { from } : {}),
    ...(replyTo ? { replyTo } : {}),
    subject: `Order ${input.orderNumber} confirmed — Decor by Kasiwa`,
    html,
  });

  await serverClient.patch(input.orderId).set({ orderConfirmationEmailSentAt: new Date().toISOString() }).commit();
}
