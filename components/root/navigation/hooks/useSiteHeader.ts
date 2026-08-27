import { useEffect, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import type { FormEvent } from "react";

export function useSiteHeader() {
  const router = useRouter();
  const pathname = usePathname();
  
  const [menuOpen, setMenuOpen] = useState(false);
  const [shopMenuOpen, setShopMenuOpen] = useState(false);
  const [search, setSearch] = useState("");

  // Mobile body lock
  useEffect(() => {
    if (!menuOpen) return;

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setMenuOpen(false);
      }
    };

    window.addEventListener("keydown", onKeyDown);

    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [menuOpen]);

  // Close desktop menu after route change
  useEffect(() => {
    setShopMenuOpen(false);
  }, [pathname]);

  // Close mobile menu when viewport becomes desktop
  useEffect(() => {
    const desktop = window.matchMedia("(min-width: 1024px)");

    const closeMobileMenuOnDesktop = (
      event: MediaQueryListEvent | MediaQueryList
    ) => {
      if (event.matches) {
        setMenuOpen(false);
      }
    };

    closeMobileMenuOnDesktop(desktop);
    desktop.addEventListener("change", closeMobileMenuOnDesktop);

    return () => {
      desktop.removeEventListener("change", closeMobileMenuOnDesktop);
    };
  }, []);

  function getSearchDestination() {
    const term = search.trim();
    return term ? `/shop?q=${encodeURIComponent(term)}` : "/shop";
  }

  function handleDesktopSearch(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    router.push(getSearchDestination());
  }

  function handleMobileSearch(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setMenuOpen(false);
    router.push(getSearchDestination());
  }

  const closeFullMenu = () => setMenuOpen(false);

  return {
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
    getSearchDestination,
  };
}