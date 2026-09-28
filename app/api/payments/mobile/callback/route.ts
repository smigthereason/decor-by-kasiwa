import { NextResponse } from "next/server";

import { handleDarajaStkCallback } from "@/lib/pos/server";
import type { DarajaStkCallbackPayload } from "@/lib/mpesa/daraja";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  try {
    const payload = (await request.json()) as DarajaStkCallbackPayload;
    await handleDarajaStkCallback(payload);
  } catch (cause) {
    // Always acknowledge the callback with HTTP 200 so Safaricom does not keep
    // retrying a payload that has already reached this endpoint. The underlying
    // payment stays pending/reconcilable if finalization could not complete.
    console.error("[Daraja callback] processing failed", cause);
  }

  return NextResponse.json({ ResultCode: 0, ResultDesc: "Accepted" });
}
