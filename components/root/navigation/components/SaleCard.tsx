import Image from "next/image";
import Link from "next/link";

interface SaleCardProps {
  onNavigate: () => void;
  clearanceCategory?: {
    title: string;
    slug: string;
    imageUrl?: string | null;
    children?: { title: string; slug: string }[];
  };
}

export function SaleCard({ onNavigate, clearanceCategory }: SaleCardProps) {
  return (
    <article className="group flex flex-col justify-between border-b border-[var(--ink)]/[0.07] pb-5">
      <div>
        {/* Title */}
        <div className="flex min-w-0 items-start pb-2">
          <Link
            href="/shop?collection=clearance"
            onClick={onNavigate}
            className="line-clamp-2 text-[11px] font-semibold uppercase leading-[1.35] tracking-[0.07em] text-[var(--deep-green)] transition-opacity hover:opacity-60"
          >
            Sale
          </Link>
        </div>

        {/* Subcategories */}
        <div className="min-w-0 py-2">
          <div className="grid gap-[3px]">
            <Link
              href="/shop?collection=offers"
              onClick={onNavigate}
              className="truncate text-[12px] leading-[1.5] text-[var(--muted)] transition-colors hover:text-[var(--ink)]"
            >
              Offers
            </Link>
            <Link
              href="/shop?collection=clearance"
              onClick={onNavigate}
              className="truncate text-[12px] leading-[1.5] text-[var(--muted)] transition-colors hover:text-[var(--ink)]"
            >
              Clearance
            </Link>
            {clearanceCategory?.children && clearanceCategory.children.length > 0 && (
              clearanceCategory.children.slice(0, 5).map((child) => (
                <Link
                  key={child.slug}
                  href={`/shop?category=${encodeURIComponent(child.slug)}`}
                  onClick={onNavigate}
                  className="truncate pl-4 text-[12px] leading-[1.5] text-[var(--muted)]/60 transition-colors hover:text-[var(--ink)]"
                >
                  {child.title}
                </Link>
              ))
            )}
          </div>
        </div>
      </div>

      {/* Image */}
      {clearanceCategory?.imageUrl && (
        <div className="w-full pt-3">
          <Link
            href="/shop?collection=clearance"
            onClick={onNavigate}
            className="relative block aspect-[16/9] w-full overflow-hidden rounded-[5px]"
          >
            <Image
              src={clearanceCategory.imageUrl}
              alt="Clearance sale"
              fill
              unoptimized
              priority
              sizes="(min-width: 720px) 16vw, 25vw"
              className="object-cover transition-transform duration-500 ease-out group-hover:scale-[1.04]"
            />
          </Link>
        </div>
      )}
    </article>
  );
}
