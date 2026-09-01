import type { ReactNode } from "react";

import SiteHeader from "@/components/root/navigation/SiteHeader";
import SiteFooter from "@/components/root/navigation/SiteFooter";
import MobileBottomNav from "@/components/root/navigation/MobileBottomNav";
import WhatsAppFloatingButton from "@/components/root/navigation/WhatsAppFloatingButton";
import { getShopNavigation } from "@/sanity/lib/catalog";

export const dynamic = "force-dynamic";

export default async function ShopLayout({
  children,
}: {
  children: ReactNode;
}) {
  const navigation = await getShopNavigation();

  return (
    <div className="flex min-h-screen flex-col pb-[76px] lg:pb-0">
      <SiteHeader navigation={navigation} />

      <main className="flex-1">
        {children}
      </main>

      <SiteFooter />

      <WhatsAppFloatingButton />
      <MobileBottomNav />
    </div>
  );
}
