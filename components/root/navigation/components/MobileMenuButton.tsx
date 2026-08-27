import { Menu } from "lucide-react";

interface MobileMenuButtonProps {
  onClick: () => void;
  isOpen: boolean;
}

export function MobileMenuButton({ onClick, isOpen }: MobileMenuButtonProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-expanded={isOpen}
      aria-controls="site-menu"
      aria-label="Open navigation menu"
      className="grid size-10 shrink-0 place-items-center rounded-full text-[var(--charcoal)] transition-colors hover:bg-charcoal/[0.04] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--sage-green)] lg:hidden"
    >
      <Menu size={24} strokeWidth={1.45} />
    </button>
  );
}