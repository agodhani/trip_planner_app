import type { LodgingResult } from '@/lib/providers/types';
import { haversineKm, kmLabel, type GeoPoint } from '@/lib/domain/geo';
import { money, plural } from '@/lib/ui-format';

/**
 * Rule-based lodging recommendation score, 0–100 with human-readable reasons.
 * No ML: weighted blend of price position vs the result set's median nightly
 * price, overall rating, review-count confidence, location rating, and —
 * when shortlisted activities have coordinates — mean distance to them.
 */
export type Scored<T> = T & { score: number; rawScore: number; reasons: string[]; activityKm?: number };

const fmtPrice = (n: number, currency: string) => money(n, currency || 'USD');
const clamp = (n: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, n));

export function scoreLodgings(
  results: LodgingResult[],
  opts: { activities?: GeoPoint[] } = {},
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

    // Distance to shortlisted activities: the MEAN over every point, so two
    // clusters on opposite sides of town can't hide in the middle. +15 within
    // 1 km, 0 at 4 km, -10 beyond 6 km.
    let activityKm: number | undefined;
    const acts = opts.activities ?? [];
    if (acts.length > 0 && r.lat !== undefined && r.lon !== undefined) {
      const km = acts.reduce((a, p) => a + haversineKm(r.lat!, r.lon!, p.lat, p.lon), 0) / acts.length;
      activityKm = km;
      score += clamp(15 - 5 * (km - 1), -10, 15);
      if (km <= 2) {
        reasons.push(`Avg ${kmLabel(km)} to your ${plural(acts.length, 'shortlisted activity', 'shortlisted activities')}`);
      } else if (km >= 5) {
        reasons.push(`Avg ${kmLabel(km)} from your shortlisted activities`);
      }
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
    return { ...r, score: final, rawScore: score, reasons, activityKm };
  });
}
