import { notFound } from 'next/navigation';
import { requireTripRole } from '@/lib/auth/guards';
import { orderDay } from '@/lib/domain/itinerary';
import { listItems, tripDays } from '@/lib/services/itinerary';
import { legsWithItems } from '@/lib/services/transport';
import { getTrip } from '@/lib/services/trips';
import { TransportClient } from '@/components/transport-client';

export default async function TransportPage({ params }: { params: Promise<{ tripId: string }> }) {
  const { tripId } = await params;
  const { role } = await requireTripRole(tripId, 'viewer');
  const trip = await getTrip(tripId);
  if (!trip) notFound();
  const [legs, items] = await Promise.all([legsWithItems(tripId), listItems(tripId)]);
  const days = tripDays(trip)?.days ?? [];

  const groups = new Map<string, { fromTitle: string; toTitle: string; day: string | null; legs: typeof legs }>();
  for (const l of legs) {
    const key = `${l.leg.fromItemId}|${l.leg.toItemId}`;
    const g = groups.get(key) ?? {
      fromTitle: l.from?.title ?? '?', toTitle: l.to?.title ?? '?',
      day: l.from?.day ?? null, legs: [],
    };
    g.legs.push(l);
    groups.set(key, g);
  }

  // Manual legs can join any two consecutive scheduled items — no coordinates needed.
  const byDay = new Map<string, typeof items>();
  for (const i of items) {
    if (!i.day || i.unplanned) continue;
    byDay.set(i.day, [...(byDay.get(i.day) ?? []), i]);
  }
  const pairs: { fromItemId: string; toItemId: string; day: string; label: string }[] = [];
  for (const [day, arr] of [...byDay.entries()].sort(([a], [b]) => a.localeCompare(b))) {
    const sorted = orderDay(arr);
    for (let i = 0; i < sorted.length - 1; i++) {
      pairs.push({
        fromItemId: sorted[i].id, toItemId: sorted[i + 1].id, day,
        label: `${sorted[i].title} → ${sorted[i + 1].title}`,
      });
    }
  }

  return (
    <TransportClient
      tripId={tripId}
      canEdit={role !== 'viewer'}
      currency={trip.currency}
      days={days}
      groups={[...groups.values()].map((g) => ({
        ...g,
        legs: g.legs.map((l) => ({
          id: l.leg.id, mode: l.leg.mode, source: l.leg.source,
          durationMin: l.leg.durationMin, distanceM: l.leg.distanceM,
          summary: l.leg.summary, deepLink: l.leg.deepLink, chosen: l.leg.chosen,
          cost: (l.leg.details as { cost?: number; currency?: string } | null)?.cost ?? null,
          costCurrency: (l.leg.details as { currency?: string } | null)?.currency ?? null,
          fromItemId: l.leg.fromItemId, toItemId: l.leg.toItemId,
        })),
      }))}
      pairs={pairs}
    />
  );
}
