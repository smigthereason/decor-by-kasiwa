import Link from "next/link";
import { topNavigation } from "../constants/navigation";

export function TopNavigationFallback({ pathname }: { pathname: string }) {
  return (
    <nav aria-label="Primary shop navigation" className="h-[44px] border-t border-white/10 bg-[var(--deep-green)]">
      <div className="flex h-full items-stretch overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        {topNavigation.map((item) => (
          <Link
            key={item.key}
            href={item.href}
            className={[
              "relative flex h-full shrink-0 items-center justify-center",
              "px-[20px] text-[11px] font-medium text-white/78",
              "sm:px-[24px] sm:text-[12px]",
              item.key === "home" && pathname === "/" ? "z-10 bg-white/12 text-white" : "",
            ].join(" ")}
          >
            {item.label}
          </Link>
        ))}
      </div>
    </nav>
  );
}