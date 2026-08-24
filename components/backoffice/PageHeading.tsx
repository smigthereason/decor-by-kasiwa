import type { ReactNode } from "react";

type Props = {
  eyebrow: string;
  title: string;
  body?: string;
  actions?: ReactNode;
};

export default function PageHeading({
  eyebrow,
  title,
  body,
  actions,
}: Props) {
  return (
    <div className="border-b border-[var(--ink)]/[0.09] bg-[var(--paper)] px-5 py-8 sm:px-7 lg:px-9 lg:py-10">
      <div className="flex flex-col gap-8 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <div className="flex items-center gap-3">
            <span className="text-[8px] font-semibold uppercase tracking-[0.16em] text-[var(--muted)]">
              {eyebrow}
            </span>
            <span className="h-px w-8 bg-black/20" />
          </div>

          <h1 className="mt-4 max-w-[850px] text-[42px] font-medium leading-[0.95] tracking-[-0.055em] sm:text-[54px] lg:text-[64px]">
            {title}
          </h1>
        </div>

        <div className="max-w-[430px]">
          {body && (
            <p className="text-[10px] leading-[1.7] text-[var(--muted)] sm:text-[11px]">
              {body}
            </p>
          )}
          {actions && <div className="mt-5 flex flex-wrap gap-2">{actions}</div>}
        </div>
      </div>
    </div>
  );
}
