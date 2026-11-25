import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = { title: "Terms of Service", description: "Terms for using Decor by Kasiwa's website and WhatsApp sales assistant.", alternates: { canonical: "/terms-of-service" } };

export default function TermsOfServicePage() {
  return (
    <article>
      <h1>Terms of service</h1>
      <p>These terms apply to use of the Decor by Kasiwa website and Decor By Kasiwa Sales Bot on WhatsApp. The services are operated by Decor by Kasiwa in Kenya.</p>
      <h2>Using our services</h2>
      <p>Use the website and sales assistant for lawful shopping, product enquiries and customer support. Provide accurate order and contact information. Do not impersonate others, interfere with the service or submit harmful content.</p>
      <h2>Product information and AI assistance</h2>
      <p>Product suggestions and automated responses are informational and may contain errors. Images, availability, dimensions and prices should be confirmed before placing an order. You may ask a member of staff to verify a recommendation.</p>
      <h2>Orders and payments</h2>
      <p>Review the product, quantity, price, delivery details and total displayed before authorising payment. An enquiry or automated chat response is not confirmation of a completed purchase. Payment is subject to verification by the payment provider and our order system. Never send card details, PINs or one-time passwords to the assistant.</p>
      <h2>Delivery, returns and refunds</h2>
      <p>Delivery arrangements and applicable purchase conditions should be confirmed when placing an order. Contact our team for assistance with damaged, incorrect or returned goods and refund requests. Nothing in these terms removes rights that cannot lawfully be excluded under applicable consumer protection law.</p>
      <h2>Privacy</h2>
      <p>Our <Link href="/privacy-policy">privacy policy</Link> explains how information is used. Our <Link href="/data-deletion">data deletion instructions</Link> explain how to request deletion.</p>
      <h2>Availability and contact</h2>
      <p>The website or automated assistant may be temporarily unavailable. Contact <a href="mailto:info@decorbykasiwa.co.ke">info@decorbykasiwa.co.ke</a> for questions or help with an existing order.</p>
    </article>
  );
}
