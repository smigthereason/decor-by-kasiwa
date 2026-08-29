import { NextResponse } from "next/server";

import {
  finalizePaystackPayment,
  verifyPaystackWebhookSignature,
} from "@/lib/paystack/server";
import { verifyPosMpesaSale } from "@/lib/pos/server";

export const dynamic = "force-dynamic";

type PaystackWebhookEvent = {
  event?: string;
  data?: {
    reference?: string;
  };
};

export async function POST(request: Request) {
  const rawBody = await request.text();
  const signature = request.headers.get("x-paystack-signature");

  if (!verifyPaystackWebhookSignature(rawBody, signature)) {
    return NextResponse.json(
      { message: "Invalid Paystack signature." },
      { status: 401 },
    );
  }

  let event: PaystackWebhookEvent;

  try {
    event = JSON.parse(rawBody) as PaystackWebhookEvent;
  } catch {
    return NextResponse.json(
      { message: "Invalid webhook payload." },
      { status: 400 },
    );
  }

  if (event.event !== "charge.success") {
    return NextResponse.json({ received: true });
  }

  const reference = event.data?.reference?.trim();

  if (!reference) {
    return NextResponse.json(
      { message: "Webhook transaction reference is missing." },
      { status: 400 },
    );
  }

  try {
    if (reference.startsWith("DBK-POS-")) {
      await verifyPosMpesaSale(reference);
    } else {
      await finalizePaystackPayment(reference);
    }

    return NextResponse.json({
      received: true,
      processed: true,
    });
  } catch (cause) {
    console.error("Paystack webhook processing failed:", cause);

    return NextResponse.json(
      {
        received: true,
        processed: false,
      },
      { status: 500 },
    );
  }
}
