"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Suspense } from "react";
import { ArrowRight, Check } from "lucide-react";
import { useCommerce } from "@/components/commerce/CommerceProvider";
import { formatMoney, getProductById } from "@/lib/products";

function SuccessContent() {
  const searchParams = useSearchParams();
  const orderId = searchParams.get("order");
  const { orders, user } = useCommerce();
  const order = orders.find((item) => item.id === orderId) || orders[0];

  return (
    <section className="w-full border-b hairline bg-[var(--paper)]">
      <div className="grid min-h-[560px] place-items-center border-b hairline px-4 py-16 text-center md:px-8">
        <div className="max-w-3xl">
          <div className="mx-auto grid size-12 place-items-center rounded-full border hairline"><Check size={18}/></div>
          <p className="kicker mt-7 text-[var(--muted)]">Order received</p>
          <h1 className="mt-5 text-[clamp(3.5rem,9vw,9rem)] font-medium leading-[0.86] tracking-[-0.075em]">THANK YOU.</h1>
          <p className="mx-auto mt-6 max-w-xl text-sm leading-relaxed text-[var(--muted)]">The prototype checkout is complete. No payment was processed. In the production build this page should be reached only after the chosen payment provider confirms the transaction or payment intent.</p>
          {order && <p className="mt-5 text-sm font-medium">Reference: {order.id}</p>}
          <div className="mt-8 flex flex-wrap justify-center gap-2">
            <Link href="/shop" className="focus-ring inline-flex items-center gap-2 rounded-full bg-[var(--ink)] px-5 py-3 text-[10px] uppercase tracking-[0.08em] text-[var(--paper)]">Continue shopping <ArrowRight size={13}/></Link>
            <Link href={user ? "/account" : "/account/register"} className="focus-ring inline-flex items-center gap-2 rounded-full border hairline px-5 py-3 text-[10px] uppercase tracking-[0.08em]">{user ? "View account" : "Create an account"}</Link>
          </div>
        </div>
      </div>

      {order && (
        <div className="grid md:grid-cols-2">
          <div className="border-b hairline p-4 md:border-b-0 md:border-r md:p-8">
            <p className="kicker text-[var(--muted)]">Delivery to</p>
            <p className="mt-4 text-sm leading-relaxed">{order.address.fullName}<br/>{order.address.address1}{order.address.address2 ? <><br/>{order.address.address2}</> : null}<br/>{order.address.city}, {order.address.region}<br/>{order.address.country}</p>
          </div>
          <div className="p-4 md:p-8">
            <p className="kicker text-[var(--muted)]">Order summary</p>
            <div className="mt-4 divide-y hairline border-y hairline">
              {order.items.map((line) => {
                const product = getProductById(line.productId);
                if (!product) return null;
                return <div key={`${line.productId}-${line.colour || "default"}`} className="flex justify-between gap-4 py-3 text-xs"><span>{line.quantity} × {product.name}</span><span>{formatMoney(product.price * line.quantity)}</span></div>
              })}
            </div>
            <div className="mt-4 flex justify-between text-sm font-medium"><span>Subtotal</span><span>{formatMoney(order.subtotal)}</span></div>
          </div>
        </div>
      )}
    </section>
  );
}

export default function CheckoutSuccessPage() {
  return <Suspense fallback={<div className="grid min-h-[60vh] place-items-center">Loading order…</div>}><SuccessContent/></Suspense>;
}
