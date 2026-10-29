import { NextResponse } from "next/server";

import { handleDarajaStkCallback } from "@/lib/pos/server";
import { dbk68HandleCallback, dbk68ReadEnabled } from "@/lib/db/dbk68-daraja-neon";
import type { DarajaStkCallbackPayload } from "@/lib/mpesa/daraja";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  try {
    const payload = (await request.json()) as DarajaStkCallbackPayload;
    const neonResult = await dbk68HandleCallback(payload);
    if (!neonResult.matched) await handleDarajaStkCallback(payload);
  } catch (cause) {
    // Always acknowledge the callback with HTTP 200 so Safaricom does not keep
    // retrying a payload that has already reached this endpoint. The underlying
    // payment stays pending/reconcilable if finalization could not complete.
    console.error("[Daraja callback] processing failed", cause);
    // During Neon cutover, an unpersisted callback must not be acknowledged as saved.
    // Provider retry is best-effort; cashier verification/reconciliation remains required.
    if (dbk68ReadEnabled()) {
      return NextResponse.json({ ResultCode: 1, ResultDesc: "Processing pending reconciliation" },
        { status: 503, headers: { "Cache-Control": "no-store" } });
    }
  }

  return NextResponse.json({ ResultCode: 0, ResultDesc: "Accepted" });
}
