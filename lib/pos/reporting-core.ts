/** Reporting dates are business dates in Kenya (UTC+03; no daylight saving). */
export function kenyaCalendarDay(timestamp: string | Date): string {
  const date = typeof timestamp === "string" ? new Date(timestamp) : timestamp;
  if (Number.isNaN(date.getTime())) return "Unknown";
  return new Date(date.getTime() + 3 * 60 * 60 * 1000).toISOString().slice(0, 10);
}

/** Inclusive Kenyan calendar day start, exclusive next-day boundary provided separately. */
export function kenyaReportWindow(period: "day" | "week" | "month", now = new Date()) {
  const today = kenyaCalendarDay(now);
  if (today === "Unknown") throw new Error("Invalid reporting clock");
  const [year, month, day] = today.split("-").map(Number);
  const startDay = new Date(Date.UTC(year, month - 1, day));
  if (period === "week") startDay.setUTCDate(startDay.getUTCDate() - 6);
  if (period === "month") startDay.setUTCDate(1);
  const start = new Date(startDay.getTime() - 3 * 60 * 60 * 1000);
  return { start: start.toISOString(), end: now.toISOString() };
}

export function allSoldProducts<T extends { revenue: number }>(rows: Iterable<T>): T[] {
  // Search/filter happens in the client. Never truncate before it has a chance to match.
  return [...rows].sort((a, b) => b.revenue - a.revenue);
}
