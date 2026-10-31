import { notFound } from 'next/navigation';
import { requireTripRole } from '@/lib/auth/guards';
import { getSerpApiAccount } from '@/lib/providers/serpapi/account';
import { optionPanel } from '@/lib/services/options';
import { resolveStayDates, stayCenters } from '@/lib/services/stay';
import { getTrip } from '@/lib/services/trips';
import { StayClient, type SerpApiStatus } from '@/components/stay-client';

export default async function StayPage({ params }: { params: Promise<{ tripId: string }> }) {
  const { tripId } = await params;
  const { role } = await requireTripRole(tripId, 'viewer');
  const trip = await getTrip(tripId);
  if (!trip) notFound();
  const [dates, centers, account, options] = await Promise.all([
    resolveStayDates(trip),
    stayCenters(trip),
    getSerpApiAccount(),
    optionPanel(tripId, 'lodging'),
  ]);
  const serpApi: SerpApiStatus =
    account.status === 'ok' ? { status: 'ok', searchesLeft: account.searchesLeft }
    : account.status === 'not_configured' ? { status: 'not_configured' }
    : { status: 'error', kind: account.kind, message: account.message };

  return (
    <StayClient
      tripId={tripId}
      canEdit={role !== 'viewer'}
      dates={dates}
      centers={centers}
      serpApi={serpApi}
      currency={trip.currency}
      options={options}
    />
  );
}
