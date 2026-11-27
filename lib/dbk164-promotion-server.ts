import "server-only";
import { bulkPromotionActive, type BulkPromotion } from "./product-pricing";

// Client-approved Black Friday 2026 exceptions. Limit to the existing campaign
// beginning 27 Nov midnight EAT; later promotions keep the default 10%.
const selected20Names = ["Shell Plastic Vase", "Bow Tie vase", "Long Corn vase", "90 Cm Beige pampas Grass", "Colored Pampas Grass"];
const blackFridayStart = Date.parse("2026-11-27T00:00:00+03:00");

/** Explicit opt-in. Invalid or incomplete settings never discount products. */
export function configuredBulkPromotion(): BulkPromotion | undefined {
  if (process.env.DBK164_PROMOTION_ENABLED !== "YES" || process.env.DBK164_PROMOTION_ROUNDING !== "WHOLE_KES") return undefined;
  const startsAt = process.env.DBK164_PROMOTION_START || "";
  const endsAt = process.env.DBK164_PROMOTION_END || "";
  const iso = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:Z|[+-]\d{2}:\d{2})$/;
  if (!iso.test(startsAt) || !iso.test(endsAt) || !Number.isFinite(Date.parse(startsAt)) || !Number.isFinite(Date.parse(endsAt)) || Date.parse(startsAt) >= Date.parse(endsAt)) return undefined;
  return {startsAt, endsAt, ...(Date.parse(startsAt) === blackFridayStart ? {selected20Names: [...selected20Names]} : {})};
}

/** Cache epoch changes both at start and end, and when a schedule is edited. */
export function promotionCacheKey(now = Date.now()): string {
  const promotion = configuredBulkPromotion();
  return promotion && bulkPromotionActive(promotion, now) ? `dbk164:${promotion.startsAt}:${promotion.endsAt}:${promotion.selected20Names?.length ? "dbk167-tier20-v1" : "base"}` : "off";
}
