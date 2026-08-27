import { Search } from "lucide-react";
import type { FormEvent } from "react";

interface DesktopSearchProps {
  search: string;
  setSearch: (value: string) => void;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
}

export function DesktopSearch({ search, setSearch, onSubmit }: DesktopSearchProps) {
  return (
    <form
      onSubmit={onSubmit}
      className="hidden h-[38px] items-center rounded-full bg-[var(--soft-cream)] pl-4 pr-2 lg:flex"
    >
      <input
        value={search}
        onChange={(event) => setSearch(event.target.value)}
        className="w-48 bg-transparent pr-3 text-[12px] font-medium text-[var(--charcoal)] outline-none placeholder:text-charcoal/40 xl:w-56"
        placeholder="Light up your search"
        aria-label="Search the collection"
      />
      <button
        type="submit"
        className="grid size-7 shrink-0 place-items-center rounded-full bg-[var(--deep-green)] text-soft-cream transition-transform hover:scale-[1.04]"
        aria-label="Submit search"
      >
        <Search size={13} strokeWidth={1.75} />
      </button>
    </form>
  );
}