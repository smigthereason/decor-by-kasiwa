import { NextRequest, NextResponse } from "next/server";

import { getApiStaff } from "@/lib/auth/api-authorization";
import { serverClient } from "@/sanity/lib/serverClient";

export const dynamic = "force-dynamic";

const DEFAULT_PROMPT = "Add a short order note (optional)";

function cleanPrompt(value: unknown) {
  return typeof value === "string" ? value.trim().slice(0, 80) : "";
}

export async function GET() {
  const staff = await getApiStaff(["ADMIN"]);
  if (!staff.ok) return NextResponse.json({ message: "Access denied." }, { status: staff.status });

  const checkoutCustomerNotePrompt = await serverClient.fetch<string | null>(
    `*[_type == "siteSettings" && _id == "siteSettings"][0].checkoutCustomerNotePrompt`,
    {},
    { cache: "no-store" },
  );

  return NextResponse.json({ checkoutCustomerNotePrompt: checkoutCustomerNotePrompt || DEFAULT_PROMPT });
}

export async function PATCH(request: NextRequest) {
  const staff = await getApiStaff(["ADMIN"]);
  if (!staff.ok) return NextResponse.json({ message: "Access denied." }, { status: staff.status });

  try {
    const body = (await request.json()) as { checkoutCustomerNotePrompt?: unknown };
    const prompt = cleanPrompt(body.checkoutCustomerNotePrompt);
    if (!prompt) {
      return NextResponse.json({ message: "Checkout note prompt cannot be empty." }, { status: 400 });
    }

    const transaction = serverClient.transaction();
    transaction.createIfNotExists({ _id: "siteSettings", _type: "siteSettings", brandName: "Decor by Kasiwa" });
    transaction.patch("siteSettings", (patch) => patch.set({ checkoutCustomerNotePrompt: prompt }));
    await transaction.commit();

    return NextResponse.json({ ok: true, checkoutCustomerNotePrompt: prompt });
  } catch (cause) {
    console.error("Unable to save checkout settings:", cause);
    return NextResponse.json(
      { message: cause instanceof Error ? cause.message : "Unable to save checkout settings." },
      { status: 500 },
    );
  }
}
