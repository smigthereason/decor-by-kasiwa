import { NextResponse } from "next/server";

import { client } from "@/sanity/lib/client";

export const dynamic = "force-dynamic";

const DEFAULT_PROMPT = "Add a short order note (optional)";

export async function GET() {
  try {
    const checkoutCustomerNotePrompt = await client.fetch<string | null>(
      `*[_type == "siteSettings" && _id == "siteSettings"][0].checkoutCustomerNotePrompt`,
      {},
      { cache: "no-store" },
    );
    return NextResponse.json({ checkoutCustomerNotePrompt: checkoutCustomerNotePrompt || DEFAULT_PROMPT });
  } catch {
    return NextResponse.json({ checkoutCustomerNotePrompt: DEFAULT_PROMPT });
  }
}
