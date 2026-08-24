// components/root/faq/FAQItem.tsx
"use client";

import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Plus } from "lucide-react";

export default function FAQItem({
  question,
  answer,
  isLast = false
}: {
  question: string;
  answer: string;
  isLast?: boolean;
}) {
  const [open, setOpen] = useState(false);

  return (
    <div className={!isLast ? "border-b hairline" : ""}>
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className="focus-ring flex w-full items-center justify-between gap-4 p-5 text-left sm:p-6"
        aria-expanded={open}
      >
        <h2 className="text-sm font-medium sm:text-base">{question}</h2>
        <motion.span
          animate={{ rotate: open ? 45 : 0 }}
          transition={{ duration: 0.3, ease: "easeInOut" }}
          className="shrink-0"
        >
          <Plus size={16} />
        </motion.span>
      </button>

      <AnimatePresence initial={false}>
        {open && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{
              duration: 0.3,
              ease: "easeInOut",
              opacity: { duration: 0.2 }
            }}
            className="overflow-hidden"
          >
            <div className="px-5 pb-5 sm:px-6 sm:pb-6">
              <p className="text-sm leading-relaxed text-[var(--muted)]">{answer}</p>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
