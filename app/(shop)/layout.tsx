import type { ReactNode } from "react";

import SiteHeader from "@/components/root/navigation/SiteHeader";
import SiteFooter from "@/components/root/navigation/SiteFooter";

export default function ShopLayout({
  children,
}: {
  children: ReactNode;
}) {
  return (
    <div className="flex min-h-screen flex-col">
      <SiteHeader />
      <main className="flex-1">
        {children}
      </main>
      <SiteFooter />
    </div>
  );
}
