import "server-only";

import { serverClient } from "@/sanity/lib/serverClient";

export type OrderChannelCode = "POS" | "COM";

type SequenceCounter = {
  _id: string;
  _rev: string;
  value?: number;
};

function sequenceDocumentId(channel: OrderChannelCode, year: string) {
  return `systemCounter.order.${channel.toLowerCase()}.${year}`;
}

function sequenceCode(value: number) {
  // Preserve the existing short format while allowing the sequence to continue
  // past 9,999 without wrapping or reusing an old order number.
  return String(value).padStart(4, "0");
}

function isRevisionConflict(cause: unknown) {
  const text = cause instanceof Error ? cause.message : String(cause || "");
  return /conflict|revision|409/i.test(text);
}

export async function createShortOrderNumber(
  channel: OrderChannelCode,
  _seed: string,
  date = new Date(),
) {
  const year = new Intl.DateTimeFormat("en", { year: "numeric", timeZone: "Africa/Nairobi" }).format(date);
  const counterId = sequenceDocumentId(channel, year);

  await serverClient.createIfNotExists({
    _id: counterId,
    _type: "systemCounter",
    counterType: "orderNumber",
    channel,
    year,
    value: 0,
    updatedAt: new Date().toISOString(),
  });

  for (let attempt = 0; attempt < 80; attempt += 1) {
    const counter = await serverClient.fetch<SequenceCounter | null>(
      `*[_id == $counterId][0]{_id,_rev,value}`,
      { counterId },
      { cache: "no-store" },
    );
    if (!counter?._rev) continue;

    const nextValue = Math.max(0, Math.floor(Number(counter.value || 0))) + 1;
    const orderNumber = `DBK-${channel}-${sequenceCode(nextValue)}-${year}`;

    try {
      await serverClient.patch(counterId).ifRevisionId(counter._rev).set({
        value: nextValue,
        lastOrderNumber: orderNumber,
        updatedAt: new Date().toISOString(),
      }).commit();
    } catch (cause) {
      if (isRevisionConflict(cause)) continue;
      throw cause;
    }

    // Historical orders used random four-digit numbers. Skip any legacy number
    // that happens to collide with the new sequence instead of reusing it.
    const exists = await serverClient.fetch<boolean>(
      `defined(*[_type == "commerceOrder" && orderNumber == $orderNumber][0]._id)`,
      { orderNumber },
      { cache: "no-store" },
    );
    if (!exists) return orderNumber;
  }

  throw new Error("Unable to allocate the next sequential order number. Please retry the sale.");
}
