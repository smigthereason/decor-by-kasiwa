import type { ReactNode } from "react";

import SiteHeader from "@/components/root/navigation/SiteHeader";
import SiteFooter from "@/components/root/navigation/SiteFooter";
import MobileBottomNav from "@/components/root/navigation/MobileBottomNav";
import WhatsAppFloatingButton from "@/components/root/navigation/WhatsAppFloatingButton";
import { getFeaturedShopLook, getShopNavigation } from "@/sanity/lib/catalog";

export const dynamic = "force-dynamic";

export default async function ShopLayout({
  children,
}: {
  children: ReactNode;
}) {
  const [navigation, featuredShopLook] = await Promise.all([
    getShopNavigation(),
    getFeaturedShopLook(),
  ]);

  return (
    <div className="flex min-h-screen flex-col pb-[76px] lg:pb-0">
      <SiteHeader navigation={navigation} shopLookPreview={featuredShopLook ? { title: featuredShopLook.title, slug: featuredShopLook.slug, imageUrl: featuredShopLook.heroImageUrl } : undefined} />

      <main className="flex-1">
        {children}
      </main>

      <SiteFooter />

      <WhatsAppFloatingButton />
      <MobileBottomNav />
    </div>
  );
}
