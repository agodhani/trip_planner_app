'use client';

import { useState } from 'react';
import { ShortlistedOptions, ui, type ShortlistedOption } from '@/components/shortlisted-options';

const { card } = ui;

export type Kind = 'flight' | 'lodging' | 'activity' | 'transport' | 'other';
const KIND_LABEL: Record<Kind, string> = {
  flight: 'Flights', lodging: 'Stays', activity: 'Activities',
  transport: 'Transport', other: 'Other',
};

/** Trip-wide shortlist: all shortlisted options grouped by kind, filterable. */
export function ShortlistClient({ tripId, canEdit, groups }: {
  tripId: string; canEdit: boolean;
  groups: { kind: Kind; items: ShortlistedOption[] }[];
}) {
  const [kind, setKind] = useState<'all' | Kind>('all');
  const total = groups.reduce((n, g) => n + g.items.length, 0);
  const counts = groups.reduce((acc, g) => {
    for (const o of g.items) acc[o.status] = (acc[o.status] ?? 0) + 1;
    return acc;
  }, {} as Record<string, number>);
  const visible = groups.filter((g) => (kind === 'all' || g.kind === kind) && g.items.length > 0);

  const pill = (active: boolean) =>
    `rounded-full border px-3 py-1 text-xs font-medium ${
      active ? 'border-teal-600 bg-teal-50 text-teal-700' : 'border-neutral-300 text-neutral-600 hover:bg-neutral-100'
    }`;

  return (
    <div className="flex flex-col gap-6">
      <section className={card}>
        <div className="flex flex-wrap items-center gap-2">
          <button type="button" className={pill(kind === 'all')} onClick={() => setKind('all')}>
            All ({total})
          </button>
          {groups.filter((g) => g.items.length > 0).map((g) => (
            <button key={g.kind} type="button" className={pill(kind === g.kind)} onClick={() => setKind(g.kind)}>
              {KIND_LABEL[g.kind]} ({g.items.length})
            </button>
          ))}
          {total > 0 && (
            <span className="ml-auto text-xs text-neutral-500">
              {[
                counts.booked ? `${counts.booked} booked` : null,
                counts.selected ? `${counts.selected} selected` : null,
                counts.shortlisted ? `${counts.shortlisted} shortlisted` : null,
                counts.rejected ? `${counts.rejected} rejected` : null,
              ].filter(Boolean).join(' · ')}
            </span>
          )}
        </div>
      </section>

      {total === 0 && (
        <section className={card}>
          <p className="text-sm text-neutral-500">
            Nothing shortlisted yet — use Shortlist on the Flights, Stay, or Activities
            tabs and everything lands here for the group to compare, vote, and pick.
          </p>
        </section>
      )}
      {visible.map((g) => (
        <ShortlistedOptions
          key={g.kind} tripId={tripId} section="shortlist"
          title={KIND_LABEL[g.kind]} canEdit={canEdit} options={g.items}
        />
      ))}
      {kind !== 'all' && visible.length === 0 && (
        <section className={card}>
          <p className="text-sm text-neutral-500">No {KIND_LABEL[kind].toLowerCase()} shortlisted.</p>
        </section>
      )}
    </div>
  );
}
