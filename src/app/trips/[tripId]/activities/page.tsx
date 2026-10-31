import { notFound } from 'next/navigation';
import { requireTripRole } from '@/lib/auth/guards';
import { getSerpApiAccount } from '@/lib/providers/serpapi/account';
import { activityCenters } from '@/lib/services/activities';
import { optionPanel } from '@/lib/services/options';
import { getTrip } from '@/lib/services/trips';
import { ActivitiesClient } from '@/components/activities-client';
import type { SerpApiStatus } from '@/components/stay-client';

export default async function ActivitiesPage({ params }: { params: Promise<{ tripId: string }> }) {
  const { tripId } = await params;
  const { role } = await requireTripRole(tripId, 'viewer');
  const trip = await getTrip(tripId);
  if (!trip) notFound();
  const [centers, account, options] = await Promise.all([
    activityCenters(trip),
    getSerpApiAccount(),
    optionPanel(tripId, 'activity'),
  ]);
  const serpApi: SerpApiStatus =
    account.status === 'ok' ? { status: 'ok', searchesLeft: account.searchesLeft }
    : account.status === 'not_configured' ? { status: 'not_configured' }
    : { status: 'error', kind: account.kind, message: account.message };

  return (
    <ActivitiesClient
      tripId={tripId}
      canEdit={role !== 'viewer'}
      centers={centers}
      serpApi={serpApi}
      options={options}
    />
  );
}
