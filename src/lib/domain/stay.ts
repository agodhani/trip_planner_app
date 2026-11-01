import type { LodgingResult } from '@/lib/providers/types';
import { money } from '@/lib/ui-format';

/**
 * Rule-based lodging recommendation score, 0–100 with human-readable reasons.
 * No ML: weighted blend of price position vs the result set's median nightly
 * price, overall rating, review-count confidence, and location rating.
 */
export type Scored<T> = T & { score: number; reasons: string[] };

const fmtPrice = (n: number, currency: string) => money(n, currency || 'USD');

export function scoreLodgings(
  results: LodgingResult[],
): Scored<LodgingResult>[] {
  const priced = results
    .map((r) => r.pricePerNight)
    .filter((p): p is number => typeof p === 'number' && p > 0)
    .sort((a, b) => a - b);
  const median = priced.length ? priced[Math.floor(priced.length / 2)] : null;

  return results.map((r) => {
    const reasons: string[] = [];
    let score = 50; // unknown-everything baseline

    // Price: up to +25 above median-half, down to -25 at 2× median.
    if (median && r.pricePerNight) {
      const ratio = r.pricePerNight / median;
      const pts = Math.max(-25, Math.min(25, (1 - ratio) * 50));
      score += pts;
      if (ratio <= 0.8) {
        reasons.push(`${fmtPrice(r.pricePerNight, r.currency ?? '')}/night — below the ${fmtPrice(median, r.currency ?? '')} median`);
      } else if (ratio >= 1.4) {
        reasons.push(`${fmtPrice(r.pricePerNight, r.currency ?? '')}/night — well above median`);
      }
    } else if (!r.pricePerNight) {
      score -= 10;
      reasons.push('No price shown');
    }

    // Rating: 5★ ⇒ +20, 3★ ⇒ 0, below ⇒ negative.
    if (r.rating !== undefined) {
      const pts = Math.max(-15, (r.rating - 3) * 10);
      score += pts;
      if (r.rating >= 4.5) reasons.push(`${r.rating} rating`);
    }

    // Review volume: confidence bonus, log-scaled to +10.
    if (r.reviews !== undefined && r.reviews > 0) {
      const pts = Math.min(10, Math.log10(r.reviews + 1) * 4);
      score += pts;
      if (r.reviews >= 500) reasons.push(`${r.reviews.toLocaleString()} reviews`);
    } else {
      score -= 5;
    }

    // Google's own location score: 5 ⇒ +15.
    if (r.locationRating !== undefined) {
      score += (r.locationRating - 3) * 7.5;
      if (r.locationRating >= 4) reasons.push('Top location score');
    }

    const final = Math.round(Math.max(0, Math.min(100, score)));
    return { ...r, score: final, reasons };
  });
}
