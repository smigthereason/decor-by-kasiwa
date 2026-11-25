import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = { title: "Privacy Policy", description: "How Decor by Kasiwa handles personal data on its website and WhatsApp sales assistant.", alternates: { canonical: "/privacy-policy" } };

export default function PrivacyPolicyPage() {
  return (
    <article>
      <h1>Privacy policy</h1>
      <p>Decor by Kasiwa, Nairobi, Kenya, operates decorbykasiwa.co.ke and the Decor By Kasiwa Sales Bot on WhatsApp. This notice describes how we handle personal information when you shop, contact us or use our sales assistant.</p>
      <h2>Information we process</h2>
      <p>We may process your name, contact details, WhatsApp phone number or platform identifier, messages and message identifiers, product enquiries, account information, delivery details, orders and payment references or status. Website usage and device information may also be collected through cookies and analytics. Payment credentials are handled by the relevant payment provider; do not send card details, PINs or one-time codes in chat.</p>
      <h2>Why we use information</h2>
      <p>We use information to answer enquiries, recommend products, check availability, process purchases and deliveries, provide customer support, maintain transaction records, protect our services and meet legal obligations. Processing is based on the applicable need to provide our services, comply with legal duties, pursue legitimate interests or obtain consent where required.</p>
      <h2>WhatsApp and automated assistance</h2>
      <p>WhatsApp messages and related identifiers may be received through Meta&apos;s WhatsApp Business Platform or an authorised messaging provider. Messages may be stored in our operational database for processing and support. The sales assistant uses automated responses and may send relevant enquiry text and catalogue context to OpenAI to generate product suggestions. AI responses may be inaccurate; prices and stock should be verified before purchase. You may request assistance from a member of staff.</p>
      <h2>Service providers and international processing</h2>
      <p>We use providers including Meta and authorised WhatsApp integration providers for messaging, Cloudflare and Vercel for hosting and delivery, Neon and Sanity for data storage and catalogue management, OpenAI for AI assistance, Google services for analytics or sign-in where used, and Paystack or M-Pesa for payments. Delivery and support providers may receive information necessary to fulfil orders. Providers may process data outside Kenya. Applicable data protection requirements and safeguards must be observed when transferring personal data.</p>
      <h2>Retention and security</h2>
      <p>Information is retained as needed for the purposes described above, including support, transaction records, security, disputes and legal obligations. Access is restricted to authorised systems and personnel as appropriate. No online system can guarantee absolute security.</p>
      <h2>Your choices and rights</h2>
      <p>Subject to applicable law, you may request access, correction, deletion or restriction of your information, object to certain processing, or withdraw consent where processing relies on consent. See our <Link href="/data-deletion">data deletion instructions</Link>. You may also contact Kenya&apos;s Office of the Data Protection Commissioner if you have a concern about our handling of your personal information.</p>
      <h2>Contact</h2>
      <p>For privacy enquiries, email <a href="mailto:info@decorbykasiwa.co.ke">info@decorbykasiwa.co.ke</a> with the subject Privacy request. Do not include passwords or payment credentials.</p>
    </article>
  );
}
