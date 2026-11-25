import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = { title: "User Data Deletion", description: "Request deletion of personal information associated with Decor by Kasiwa and its WhatsApp sales assistant.", alternates: { canonical: "/data-deletion" } };

export default function DataDeletionPage() {
  return (
    <article>
      <h1>User data deletion instructions</h1>
      <p>You can request deletion of personal information associated with your Decor by Kasiwa website account or Decor By Kasiwa Sales Bot WhatsApp conversations, whether or not you have made a purchase.</p>
      <h2>How to submit a request</h2>
      <ol className="list-decimal pl-6">
        <li>Email <a href="mailto:info@decorbykasiwa.co.ke?subject=Data%20deletion%20request">info@decorbykasiwa.co.ke</a> with the subject Data deletion request.</li>
        <li>Provide the WhatsApp number or account email associated with your use of the service, and specify whether you want chat data, account data or all eligible personal information deleted.</li>
        <li>We may ask for proportionate information to verify your identity. Do not send passwords, payment credentials or one-time codes.</li>
      </ol>
      <h2>What happens next</h2>
      <p>Our team will review the verified request, locate the relevant records, delete or anonymise eligible personal information and address relevant copies held by service providers as required. We will respond within applicable legal time limits and explain any information that must be retained.</p>
      <p>Some records may need to be retained for accounting, legal obligations, fraud prevention or dispute resolution. This does not mean that all conversation data must be retained. Backups may be subject to separate secure retention and expiry procedures.</p>
      <h2>Data held by other platforms</h2>
      <p>Deleting data from our systems does not automatically remove messages stored on your own device or information independently held by WhatsApp, Meta or other providers. You can manage those records through the relevant platform.</p>
      <p>For further information, read our <Link href="/privacy-policy">privacy policy</Link>.</p>
    </article>
  );
}
