// import type { LucideIcon } from "lucide-react";

// type Props = {
//   label: string;
//   value: string;
//   detail: string;
//   icon: LucideIcon;
//   index: string;
// };

// export default function MetricCard({
//   label,
//   value,
//   detail,
//   icon: Icon,
//   index,
// }: Props) {
//   return (
//     <article className="flex min-h-[190px] flex-col justify-between border-r border-b border-[var(--ink)]/[0.08] bg-[var(--paper)] p-5 lg:p-6">
//       <div className="flex items-start justify-between">
//         <span className="text-[8px] font-semibold uppercase tracking-[0.15em] text-[var(--muted)]">
//           {index} · {label}
//         </span>

//         <Icon size={16} strokeWidth={1.25} className="text-[var(--muted)]" />
//       </div>

//       <div>
//         <p className="text-[34px] font-medium leading-none tracking-[-0.055em] lg:text-[42px]">
//           {value}
//         </p>
//         <p className="mt-3 max-w-[230px] text-[10px] leading-[1.6] text-[var(--muted)]">
//           {detail}
//         </p>
//       </div>
//     </article>
//   );
// }
// components/backoffice/MetricCard.tsx
import type { LucideIcon } from "lucide-react";

export default function MetricCard({
  index,
  label,
  value,
  detail,
  icon: Icon,
}: {
  index: string;
  label: string;
  value: string;
  detail: string;
  icon: LucideIcon;
}) {
  return (
    <article className="flex flex-col border-b hairline bg-[var(--paper)] p-4 sm:p-6 lg:p-7">
      <div className="flex items-start justify-between">
        <span className="text-[10px] tracking-[0.08em] text-[var(--muted)]">
          {index}
        </span>
        <Icon size={18} strokeWidth={1.5} className="text-[var(--muted)]" />
      </div>

      <p className="mt-4 text-[10px] font-semibold uppercase tracking-[0.08em] text-[var(--muted)]">
        {label}
      </p>
      <p className="mt-2 text-2xl font-medium tracking-[-0.04em] sm:text-3xl">
        {value}
      </p>
      <p className="mt-3 text-xs leading-relaxed text-[var(--muted)]">
        {detail}
      </p>
    </article>
  );
}
