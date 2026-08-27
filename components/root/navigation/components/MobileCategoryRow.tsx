import { useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { ChevronDown } from "lucide-react";
import Link from "next/link";
import { categoryHref } from "../constants/navigation";

interface MobileCategoryRowProps {
  title: string;
  slug: string;
  children: { title: string; slug: string }[];
  onNavigate: () => void;
}

export function MobileCategoryRow({ title, slug, children, onNavigate }: MobileCategoryRowProps) {
  const [open, setOpen] = useState(false);

  return (
    <div className="border-b border-soft-cream/5 last:border-b-0">
      <div className="flex min-h-12 items-center gap-2">
        <Link
          href={categoryHref(slug)}
          onClick={onNavigate}
          className="flex flex-1 py-3 text-[14px] font-medium text-soft-cream/85 transition-colors hover:text-soft-cream"
        >
          {title}
        </Link>
        {children.length > 0 && (
          <button
            type="button"
            onClick={() => setOpen((value) => !value)}
            aria-expanded={open}
            aria-label={`${open ? "Collapse" : "Expand"} ${title}`}
            className="grid size-10 shrink-0 place-items-center rounded-full transition-colors hover:bg-soft-cream/5"
          >
            <ChevronDown size={16} className={`transition-transform ${open ? "rotate-180" : ""}`} />
          </button>
        )}
      </div>

      <AnimatePresence initial={false}>
        {open && children.length > 0 && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="overflow-hidden"
          >
            <div className="grid gap-1 pb-3 pl-4">
              {children.map((child) => (
                <Link
                  key={child.slug}
                  href={categoryHref(child.slug)}
                  onClick={onNavigate}
                  className="min-h-10 py-2 text-[14px] leading-6 text-soft-cream/50 transition-colors hover:text-soft-cream"
                >
                  {child.title}
                </Link>
              ))}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}