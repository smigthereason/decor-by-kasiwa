import "server-only";
import { bulkPromotionActive, type BulkPromotion } from "./product-pricing";

/** Explicit opt-in. Invalid or incomplete settings never discount products. */
export function configuredBulkPromotion(): BulkPromotion | undefined {
  if (process.env.DBK164_PROMOTION_ENABLED !== "YES" || process.env.DBK164_PROMOTION_ROUNDING !== "WHOLE_KES") return undefined;
  const startsAt = process.env.DBK164_PROMOTION_START || "";
  const endsAt = process.env.DBK164_PROMOTION_END || "";
  const iso = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:Z|[+-]\d{2}:\d{2})$/;
  if (!iso.test(startsAt) || !iso.test(endsAt) || !Number.isFinite(Date.parse(startsAt)) || !Number.isFinite(Date.parse(endsAt)) || Date.parse(startsAt) >= Date.parse(endsAt)) return undefined;
  return {startsAt, endsAt};
}

/** Cache epoch changes both at start and end, and when a schedule is edited. */
export function promotionCacheKey(now = Date.now()): string {
  const promotion = configuredBulkPromotion();
  return promotion && bulkPromotionActive(promotion, now) ? `dbk164:${promotion.startsAt}:${promotion.endsAt}` : "off";
}
