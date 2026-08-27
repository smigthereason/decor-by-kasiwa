type Props = {
  value: string;
};

const labels: Record<string, string> = {
  pending: "Pending",
  paid: "Paid",
  processing: "Processing",
  ready_for_store: "Sent to store",
  picking: "Picking",
  packed: "Packed",
  dispatched: "Dispatched",
  delivered: "Delivered",
  cancelled: "Cancelled",
  refunded: "Refunded",
  failed: "Failed",
  awaiting_store: "Awaiting store",
  received: "Received",
  ready_dispatch: "Ready to dispatch",
  exception: "Exception",
  healthy: "Healthy",
  low: "Low stock",
  out: "Out of stock",
};

export default function StatusPill({ value }: Props) {
  const tone =
    value === "delivered" || value === "healthy" || value === "paid"
      ? "border-[var(--deep-green)]/20 bg-[var(--sage-green)]/15 text-[var(--deep-green)]"
      : value === "cancelled" || value === "failed" || value === "exception" || value === "out"
        ? "border-[#7b3b32]/20 bg-[#7b3b32]/10 text-[#6b3028]"
        : value === "low"
          ? "border-[var(--brand-gold)]/35 bg-[var(--brand-gold)]/12 text-[var(--charcoal)]"
          : "border-[var(--ink)]/10 bg-[var(--ink)]/[0.035] text-[var(--muted)]";

  return (
    <span
      className={[
        "inline-flex items-center border px-2.5 py-1",
        "text-[8px] font-semibold uppercase tracking-[0.12em]",
        tone,
      ].join(" ")}
    >
      {labels[value] ?? value.replaceAll("_", " ")}
    </span>
  );
}
