import { notFound } from 'next/navigation';
import { requireTripRole } from '@/lib/auth/guards';
import { legsWithItems } from '@/lib/services/transport';
import { getTrip } from '@/lib/services/trips';
import { TransportClient } from '@/components/transport-client';

export default async function TransportPage({ params }: { params: Promise<{ tripId: string }> }) {
  const { tripId } = await params;
  const { role } = await requireTripRole(tripId, 'viewer');
  const trip = await getTrip(tripId);
  if (!trip) notFound();
  const legs = await legsWithItems(tripId);

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

  return (
    <TransportClient
      tripId={tripId}
      canEdit={role !== 'viewer'}
      currency={trip.currency}
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
      pairs={[...groups.values()].map((g) => ({
        fromItemId: g.legs[0].leg.fromItemId, toItemId: g.legs[0].leg.toItemId,
        label: `${g.fromTitle} → ${g.toTitle}`,
      }))}
    />
  );
}
