import Image from "next/image";
import Link from "next/link";
import { categoryHref } from "../constants/navigation";

interface CategoryCardProps {
  title: string;
  slug: string;
  imageUrl?: string | null;
  children: { title: string; slug: string }[];
  onNavigate: () => void;
}

export function CategoryCard({ title, slug, imageUrl, children, onNavigate }: CategoryCardProps) {
  return (
    <article className="group grid min-w-0 grid-rows-[36px_3fr_auto] border-b border-[var(--ink)]/[0.07] pb-5">
      {/* Title Area */}
      <div className="flex min-w-0 items-start">
        <Link
          href={categoryHref(slug)}
          onClick={onNavigate}
          className="line-clamp-2 text-[11px] font-semibold uppercase leading-[1.35] tracking-[0.07em] text-[var(--ink)] transition-opacity hover:opacity-60"
        >
          {title}
        </Link>
      </div>

      {/* Subcategory Area */}
      <div className="min-w-0 py-2">
        {children.length > 0 ? (
          <div className="grid gap-[3px]">
            {children.slice(0, 7).map((child) => (
              <Link
                key={child.slug}
                href={categoryHref(child.slug)}
                onClick={onNavigate}
                className="truncate text-[12px] leading-[1.5] text-[var(--muted)] transition-colors hover:text-[var(--ink)]"
              >
                {child.title}
              </Link>
            ))}
          </div>
        ) : (
          <Link
            href={categoryHref(slug)}
            onClick={onNavigate}
            className="text-[11px] text-[var(--muted)]/60 transition-colors hover:text-[var(--ink)]"
          >
            Explore collection
          </Link>
        )}
      </div>

      {/* Image Area */}
      <div className="min-h-[200px] w-full pt-1">
        {imageUrl ? (
          <Link
            href={categoryHref(slug)}
            onClick={onNavigate}
            className="relative block h-full w-full min-h-[100px] max-h-[160px] overflow-hidden rounded-[5px] bg-[var(--paper-2)]"
          >
            <Image
              src={imageUrl}
              alt={title}
              fill
              unoptimized
              sizes="(min-width: 720px) 16vw, 25vw"
              className="object-cover transition-transform duration-500 ease-out group-hover:scale-[1.04]"
            />
            <span className="pointer-events-none absolute inset-0 bg-gradient-to-t from-black/[0.08] to-transparent opacity-0 transition-opacity duration-300 group-hover:opacity-100" />
          </Link>
        ) : (
          <div className="h-full w-full min-h-[100px] max-h-[160px] rounded-[5px] bg-[var(--paper-2)]/40" />
        )}
      </div>
    </article>
  );
}
