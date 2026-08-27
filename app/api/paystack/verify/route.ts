import { NextResponse } from "next/server";

import { finalizePaystackPayment } from "@/lib/paystack/server";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const reference = searchParams.get("reference")?.trim();

    if (!reference) {
      return NextResponse.json(
        { message: "Paystack reference is required." },
        { status: 400 },
      );
    }

    const order = await finalizePaystackPayment(reference);

    return NextResponse.json({
      verified: true,
      order,
    });
  } catch (cause) {
    console.error("Paystack verification failed:", cause);

    return NextResponse.json(
      {
        verified: false,
        message:
          cause instanceof Error
            ? cause.message
            : "Unable to verify Paystack payment.",
      },
      { status: 409 },
    );
  }
}
