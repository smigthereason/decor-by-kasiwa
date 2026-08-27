import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { ChevronDown } from "lucide-react";
import { topNavigation } from "../constants/navigation";

interface TopNavigationProps {
  pathname: string;
  shopMenuOpen: boolean;
  onShopOpen: () => void;
  onShopClose: () => void;
  onShopToggle: () => void;
}

function isActive(key: string, pathname: string, collection: string | null) {
  if (key === "home") return pathname === "/";
  if (key === "shop") return pathname === "/shop" && !collection;
  if (key === "new-arrivals") return pathname === "/shop" && collection === "new-arrivals";
  if (key === "best-sellers") return pathname === "/shop" && collection === "best-sellers";
  if (key === "about") return pathname === "/about";
  if (key === "contact") return pathname === "/contact";
  return false;
}

export function TopNavigation({ pathname, shopMenuOpen, onShopOpen, onShopClose, onShopToggle }: TopNavigationProps) {
  const searchParams = useSearchParams();
  const collection = searchParams.get("collection");

  return (
    <nav aria-label="Primary shop navigation" className="h-[44px] bg-[var(--paper-2)]">
      <div className="flex h-full items-stretch overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        {topNavigation.map((item) => (
          <Link
            key={item.key}
            href={item.href}
            onMouseEnter={() => (item.key === "shop" ? onShopOpen() : onShopClose())}
            onFocus={() => (item.key === "shop" ? onShopOpen() : onShopClose())}
            onClick={(event) => {
              if (item.key !== "shop") return;
              if (typeof window !== "undefined" && window.matchMedia("(min-width: 1024px)").matches) {
                event.preventDefault();
                onShopToggle();
              }
            }}
            aria-current={isActive(item.key, pathname, collection) ? "page" : undefined}
            aria-haspopup={item.key === "shop" ? "menu" : undefined}
            aria-expanded={item.key === "shop" ? shopMenuOpen : undefined}
            className={[
              "relative flex h-full shrink-0 items-center justify-center",
              "px-[20px] text-[11px] font-medium text-[var(--charcoal)]",
              "transition-colors duration-200 sm:px-[24px] sm:text-[12px]",
              "focus-visible:z-20 focus-visible:outline-none",
              "focus-visible:ring-1 focus-visible:ring-inset focus-visible:ring-charcoal/35",
              isActive(item.key, pathname, collection)
                ? "z-10 rounded-t-[8px] bg-[var(--paper)] shadow-[0_-2px_8px_rgba(0,0,0,0.02)]"
                : "hover:bg-charcoal/[0.025]",
            ].join(" ")}
          >
            {item.label}
            {item.key === "shop" && (
              <ChevronDown size={13} className={`ml-1.5 transition-transform ${shopMenuOpen ? "rotate-180" : ""}`} />
            )}
          </Link>
        ))}
        <div className="min-w-6 flex-1" aria-hidden="true" />
      </div>
    </nav>
  );
}