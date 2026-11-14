import { dbk109MaintenanceDecision, dbk109FreezeMessage } from '@/lib/db/dbk109-maintenance';
import { NextResponse } from "next/server";

import {
  initializePaystackCheckout,
  type CheckoutAddress,
  type CheckoutCartLine,
} from "@/lib/paystack/server";

export const dynamic = "force-dynamic";

type InitializeBody = {
  email?: string;
  address?: CheckoutAddress;
  cart?: CheckoutCartLine[];
  paymentMethod?: string;
  deliveryOptionId?: string;
  customerNote?: string;
};

export async function POST(request: Request) {
  const maintenance = await dbk109MaintenanceDecision();
  if (maintenance !== 'OPEN') {
    return NextResponse.json({code:'DBK109_CUTOVER_FREEZE',retryable:false,
      message:dbk109FreezeMessage(maintenance)},
      {status:503,headers:{'Cache-Control':'private, no-store'}});
  }

  try {
    const body = (await request.json()) as InitializeBody;

    if (!body.address || !Array.isArray(body.cart)) {
      return NextResponse.json(
        { message: "Checkout details are incomplete." },
        { status: 400 },
      );
    }

    const requestUrl = new URL(request.url);
    const configuredSiteUrl = process.env.NEXT_PUBLIC_SITE_URL?.trim();
    const callbackBaseUrl = configuredSiteUrl || requestUrl.origin;

    const result = await initializePaystackCheckout({
      email: body.email || "",
      address: body.address,
      cart: body.cart,
      paymentMethod: body.paymentMethod || "Card",
      deliveryOptionId: body.deliveryOptionId,
      customerNote: body.customerNote,
      callbackBaseUrl,
    });

    return NextResponse.json(result);
  } catch (cause) {
    console.error("Paystack initialize failed:", cause);

    return NextResponse.json(
      {
        message:
          cause instanceof Error
            ? cause.message
            : "Unable to initialize Paystack checkout.",
      },
      { status: 400 },
    );
  }
}
