"use client";

import { Suspense } from "react";
import { useCommerce } from "@/components/root/commerce/CommerceProvider";

import { useSiteHeader } from "./hooks/useSiteHeader";
import { Logo } from "./components/Logo";
import { DesktopSearch } from "./components/DesktopSearch";
import { HeaderActions } from "./components/HeaderActions";
import { MobileMenuButton } from "./components/MobileMenuButton";
import { TopNavigation } from "./components/TopNavigation";
import { TopNavigationFallback } from "./components/TopNavigationFallback";
import { MegaMenu } from "./components/MegaMenu";
import { MobileMenu } from "./components/MobileMenu";

import type { ShopNavigation } from "@/types/commerce";

interface SiteHeaderProps {
  navigation: ShopNavigation;
}

export default function SiteHeader({ navigation }: SiteHeaderProps) {
  const { cartCount, user, wishlist } = useCommerce();
  const {
    pathname,
    menuOpen,
    setMenuOpen,
    shopMenuOpen,
    setShopMenuOpen,
    search,
    setSearch,
    handleDesktopSearch,
    handleMobileSearch,
    closeFullMenu,
  } = useSiteHeader();

  return (
    <>
      <header className="sticky top-0 z-50 w-full bg-[var(--paper-2)] shadow-[0_1px_3px_rgba(0,0,0,0.04)]">
        {/* Main Header Row */}
        <div className="grid h-[74px] grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-center px-4 sm:h-[90px] sm:px-7 lg:px-7">
          {/* Left */}
          <div className="flex min-w-0 items-center justify-start">
            <MobileMenuButton onClick={() => setMenuOpen(true)} isOpen={menuOpen} />
            <DesktopSearch search={search} setSearch={setSearch} onSubmit={handleDesktopSearch} />
          </div>

          {/* Logo */}
          <Logo />

          {/* Right */}
          <HeaderActions user={user} wishlist={wishlist} cartCount={cartCount} />
        </div>

        {/* Desktop Navigation */}
        <div
          className="relative hidden lg:block"
          onMouseLeave={() => setShopMenuOpen(false)}
          onBlurCapture={(event) => {
            if (!event.currentTarget.contains(event.relatedTarget as Node | null)) {
              setShopMenuOpen(false);
            }
          }}
        >
          <Suspense fallback={<TopNavigationFallback pathname={pathname} />}>
            <TopNavigation
              pathname={pathname}
              shopMenuOpen={shopMenuOpen}
              onShopOpen={() => setShopMenuOpen(true)}
              onShopClose={() => setShopMenuOpen(false)}
              onShopToggle={() => setShopMenuOpen((value) => !value)}
            />
          </Suspense>

          {shopMenuOpen && (
            <MegaMenu navigation={navigation} onNavigate={() => setShopMenuOpen(false)} />
          )}
        </div>
      </header>

      {/* Mobile Menu */}
      <MobileMenu
        isOpen={menuOpen}
        onClose={closeFullMenu}
        navigation={navigation}
        search={search}
        setSearch={setSearch}
        onSubmit={handleMobileSearch}
      />
    </>
  );
}
