import { requireTripRole } from '@/lib/auth/guards';
import { optionPanel } from '@/lib/services/options';
import { ShortlistClient, type Kind } from '@/components/shortlist-client';

const KINDS: Kind[] = ['flight', 'lodging', 'activity', 'transport', 'other'];

export default async function ShortlistPage({ params }: { params: Promise<{ tripId: string }> }) {
  const { tripId } = await params;
  const { role } = await requireTripRole(tripId, 'viewer');
  const groups = await Promise.all(
    KINDS.map(async (kind) => ({ kind, items: await optionPanel(tripId, kind) })),
  );
  return <ShortlistClient tripId={tripId} canEdit={role !== 'viewer'} groups={groups} />;
}
