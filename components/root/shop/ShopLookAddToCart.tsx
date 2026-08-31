"use client";

import Link from "next/link";
import { Check, ShoppingCart } from "lucide-react";
import { useState } from "react";

import { useCommerce } from "@/components/root/commerce/CommerceProvider";

type LookLine = {
  productId: string;
  quantity: number;
  name: string;
};

export default function ShopLookAddToCart({ lines }: { lines: LookLine[] }) {
  const { addToCart } = useCommerce();
  const [addedCount, setAddedCount] = useState<number | null>(null);

  function addLook() {
    let added = 0;

    for (const line of lines) {
      if (addToCart(line.productId, line.quantity)) {
        added += 1;
      }
    }

    setAddedCount(added);
  }

  const complete = addedCount === lines.length && lines.length > 0;

  return (
    <div className="flex flex-wrap items-center gap-3">
      <button
        type="button"
        onClick={addLook}
        disabled={lines.length === 0}
        className="focus-ring inline-flex min-h-12 items-center gap-2 rounded-full bg-[var(--deep-green)] px-6 text-[10px] font-semibold uppercase tracking-[0.08em] !text-soft-cream disabled:cursor-not-allowed disabled:opacity-50"
      >
        {complete ? <Check size={15} /> : <ShoppingCart size={15} />}
        {complete ? "Look added to cart" : "Add complete look to cart"}
      </button>

      {addedCount !== null && !complete && (
        <p className="text-xs text-[var(--muted)]">
          {addedCount} of {lines.length} products were added. Unavailable pieces were skipped.
        </p>
      )}

      {addedCount !== null && addedCount > 0 && (
        <Link
          href="/cart"
          className="text-[10px] font-semibold uppercase tracking-[0.08em] underline underline-offset-4"
        >
          View cart
        </Link>
      )}
    </div>
  );
}
