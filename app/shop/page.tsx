import PageIntro from "@/components/PageIntro";
import ShopGrid from "@/components/shop/ShopGrid";
import { Suspense } from "react";

export const metadata = { title: "Shop" };

export default function ShopPage() {
  return (
    <>
      <PageIntro
        eyebrow="Décor Collection"
        title="Objects for considered living."
        body="Furniture, lighting, textiles and décor presented as part of a complete design language rather than isolated catalogue items."
      />
      <Suspense
        fallback={
          <div className="grid min-h-80 w-full place-items-center bg-[var(--paper)] text-xs uppercase tracking-[0.08em]">
            Loading collection…
          </div>
        }
      >
        <ShopGrid />
      </Suspense>
    </>
  );
}
