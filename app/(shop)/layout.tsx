import type { ReactNode } from "react";
import SiteHeader from "@/components/root/navigation/SiteHeader";
import SiteFooter from "@/components/root/navigation/SiteFooter";
import { getShopNavigation } from "@/sanity/lib/catalog";

export const dynamic = "force-dynamic";

export default async function ShopLayout({ children }: { children: ReactNode }) {
  const navigation = await getShopNavigation();`
  return (
    <div className="flex min-h-screen flex-col">
      <SiteHeader navigation={navigation} />
      <main className="flex-1">{children}</main>
      <SiteFooter />
    </div>
  );
}
