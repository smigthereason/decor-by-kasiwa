import "server-only";

import { createHash } from "node:crypto";

import { serverClient } from "@/sanity/lib/serverClient";

export type OrderChannelCode = "POS" | "COM";

function fourDigitCode(seed: string, attempt: number) {
  const digest = createHash("sha256").update(`${seed}|${attempt}`).digest("hex");
  const numeric = Number.parseInt(digest.slice(0, 8), 16);
  return String(1000 + (numeric % 9000));
}

export async function createShortOrderNumber(
  channel: OrderChannelCode,
  seed: string,
  date = new Date(),
) {
  const year = new Intl.DateTimeFormat("en", { year: "numeric", timeZone: "Africa/Nairobi" }).format(date);

  for (let attempt = 0; attempt < 32; attempt += 1) {
    const code = fourDigitCode(seed, attempt);
    const orderNumber = `DBK-${channel}-${code}-${year}`;
    const exists = await serverClient.fetch<boolean>(
      `defined(*[_type == "commerceOrder" && orderNumber == $orderNumber][0]._id)`,
      { orderNumber },
      { cache: "no-store" },
    );

    if (!exists) return orderNumber;
  }

  throw new Error("Unable to allocate a short order number. Please retry the sale.");
}
