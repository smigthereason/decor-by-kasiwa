import "server-only";

import { sendSmtpEmail } from "@/lib/email/smtp";

function escapeHtml(value: string) {
  return value.replace(/[&<>"']/g, (char) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#039;",
  }[char] || char));
}

export async function sendPasswordResetEmail(input: { email: string; name: string; resetUrl: string }) {
  const from = process.env.AUTH_EMAIL_FROM?.trim() || process.env.SMTP_FROM?.trim();
  const replyTo = process.env.EMAIL_REPLY_TO?.trim() || process.env.ORDER_EMAIL_REPLY_TO?.trim();

  await sendSmtpEmail({
    to: input.email,
    ...(from ? { from } : {}),
    ...(replyTo ? { replyTo } : {}),
    subject: "Reset your Decor by Kasiwa password",
    html: `
      <div style="font-family:Arial,sans-serif;line-height:1.6;color:#1d1d1b;max-width:560px;margin:auto">
        <h2 style="color:#0b8f4f">Reset your password</h2>
        <p>Hello ${escapeHtml(input.name || "there")},</p>
        <p>Use the button below to choose a new Decor by Kasiwa password. This link expires in 30 minutes.</p>
        <p style="margin:28px 0"><a href="${escapeHtml(input.resetUrl)}" style="background:#0b8f4f;color:white;padding:12px 20px;border-radius:999px;text-decoration:none;font-weight:600">Reset password</a></p>
        <p>If you did not request this change, you can ignore this email.</p>
      </div>
    `,
  });
}
