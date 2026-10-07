import { Search } from "lucide-react";
import type { FormEvent } from "react";

interface MobileLandingSearchProps {
  search: string;
  setSearch: (value: string) => void;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
}

export function MobileLandingSearch({ search, setSearch, onSubmit }: MobileLandingSearchProps) {
  return (
    <section className="border-b border-black/5 bg-[var(--paper)] px-4 py-3 lg:hidden" aria-label="Product search">
      <form onSubmit={onSubmit} className="mx-auto flex min-h-12 w-full max-w-2xl items-center rounded-full border hairline bg-white pl-4 pr-2 shadow-[0_2px_12px_rgba(0,0,0,0.04)]">
        <Search size={18} strokeWidth={1.5} className="mr-3 shrink-0 text-[var(--muted)]" />
        <input
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          placeholder="Search products, categories or SKU"
          aria-label="Search Decor by Kasiwa"
          autoComplete="off"
          className="min-w-0 flex-1 bg-transparent text-base text-[var(--ink)] outline-none placeholder:text-[var(--muted)]"
        />
        <button type="submit" aria-label="Search" className="grid size-10 shrink-0 place-items-center rounded-full bg-[var(--brand-green)] !text-soft-cream">
          <Search size={16} strokeWidth={1.7} />
        </button>
      </form>
    </section>
  );
}
