import type { LucideIcon } from "lucide-react";

type Props = {
  label: string;
  value: string;
  detail: string;
  icon: LucideIcon;
  index: string;
};

export default function MetricCard({
  label,
  value,
  detail,
  icon: Icon,
  index,
}: Props) {
  return (
    <article className="flex min-h-[190px] flex-col justify-between border-r border-b border-[var(--ink)]/[0.08] bg-[var(--paper)] p-5 lg:p-6">
      <div className="flex items-start justify-between">
        <span className="text-[8px] font-semibold uppercase tracking-[0.15em] text-[var(--muted)]">
          {index} · {label}
        </span>

        <Icon size={16} strokeWidth={1.25} className="text-[var(--muted)]" />
      </div>

      <div>
        <p className="text-[34px] font-medium leading-none tracking-[-0.055em] lg:text-[42px]">
          {value}
        </p>
        <p className="mt-3 max-w-[230px] text-[10px] leading-[1.6] text-[var(--muted)]">
          {detail}
        </p>
      </div>
    </article>
  );
}
