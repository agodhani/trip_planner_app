import { requireTripRole } from '@/lib/auth/guards';
import { listRemovedOptions, optionPanel } from '@/lib/services/options';
import { ShortlistClient, type Kind } from '@/components/shortlist-client';

const KINDS: Kind[] = ['flight', 'lodging', 'activity', 'transport', 'other'];

export default async function ShortlistPage({ params }: { params: Promise<{ tripId: string }> }) {
  const { tripId } = await params;
  const { role } = await requireTripRole(tripId, 'viewer');
  const canEdit = role !== 'viewer';
  const [groups, removed] = await Promise.all([
    Promise.all(KINDS.map(async (kind) => ({ kind, items: await optionPanel(tripId, kind) }))),
    // The bin is editors-only — viewers can't act on it and never fetch it.
    canEdit ? listRemovedOptions(tripId) : Promise.resolve([]),
  ]);
  return (
    <ShortlistClient
      tripId={tripId}
      canEdit={canEdit}
      groups={groups}
      removed={removed.map((r) => ({
        id: r.option.id,
        title: r.option.title,
        kind: r.option.kind,
        removedAt: (r.option.removedAt ?? new Date(0)).toISOString(),
        removedBy: r.remover,
      }))}
    />
  );
}
