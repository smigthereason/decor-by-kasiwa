import Link from "next/link";
import { topNavigation } from "../constants/navigation";

export function TopNavigationFallback({ pathname }: { pathname: string }) {
  return (
    <nav aria-label="Primary shop navigation" className="h-[44px] bg-[var(--paper-2)]">
      <div className="flex h-full items-stretch overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        {topNavigation.map((item) => (
          <Link
            key={item.key}
            href={item.href}
            className={[
              "relative flex h-full shrink-0 items-center justify-center",
              "px-[20px] text-[11px] font-medium text-[var(--charcoal)]",
              "sm:px-[24px] sm:text-[12px]",
              item.key === "home" && pathname === "/" ? "z-10 rounded-t-[8px] bg-[var(--paper)]" : "",
            ].join(" ")}
          >
            {item.label}
          </Link>
        ))}
      </div>
    </nav>
  );
}