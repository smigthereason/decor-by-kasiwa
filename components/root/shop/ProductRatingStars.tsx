"use client";

import { Star } from "lucide-react";

export default function ProductRatingStars({
  rating,
  size = 13,
  className = "",
}: {
  rating: number;
  size?: number;
  className?: string;
}) {
  const safeRating = Math.max(0, Math.min(5, Number.isFinite(rating) ? rating : 0));

  return (
    <span className={`inline-flex items-center gap-0.5 ${className}`} aria-hidden="true">
      {[0, 1, 2, 3, 4].map((index) => {
        const fillPercent = Math.max(0, Math.min(100, (safeRating - index) * 100));
        return (
          <span key={index} className="relative inline-block shrink-0" style={{ width: size, height: size }}>
            <Star size={size} className="absolute inset-0 text-[var(--brand-gold)]/35" />
            {fillPercent > 0 && (
              <span className="absolute inset-y-0 left-0 overflow-hidden" style={{ width: `${fillPercent}%` }}>
                <Star size={size} className="max-w-none fill-[var(--brand-gold)] text-[var(--brand-gold)]" />
              </span>
            )}
          </span>
        );
      })}
    </span>
  );
}
