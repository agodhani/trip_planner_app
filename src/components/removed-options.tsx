'use client';

import { useState } from 'react';
import { RotateCcw, Trash2 } from 'lucide-react';
import { purgeOptionAction, restoreOptionAction } from '@/lib/actions/options';
import { HiddenIds, ui } from '@/components/shortlisted-options';
import { SubmitButton } from '@/components/submit-button';
import { useToast } from '@/components/toaster';
import { timeAgo } from '@/lib/ui-format';

const { btn2, card } = ui;

export type RemovedOptionItem = {
  id: string;
  title: string;
  kind: string;
  /** ISO timestamp — rendered as a relative "… ago" label. */
  removedAt: string;
  removedBy: string | null;
};

/**
 * "Recently removed" — the bin, editors only. Restore brings the option back
 * with its votes and comments; "Delete forever" needs a second click to
 * confirm because it really is permanent.
 */
export function RemovedOptions({ tripId, items }: {
  tripId: string;
  items: RemovedOptionItem[];
}) {
  const toast = useToast();
  const [armed, setArmed] = useState<string | null>(null);
  const [purging, setPurging] = useState(false);
  if (!items.length) return null;
  return (
    <details className={card} data-testid="removed-options">
      <summary className="cursor-pointer select-none font-semibold">
        Recently removed ({items.length})
      </summary>
      <p className="mt-1 text-xs text-neutral-500">
        Removed options keep their votes and comments — Restore brings everything back.
        Delete forever is permanent.
      </p>
      <ul className="mt-3 flex flex-col gap-2">
        {items.map((o) => (
          <li
            key={o.id}
            className="flex flex-wrap items-center gap-2 rounded-lg border border-neutral-200 px-3 py-2"
          >
            <div className="min-w-0 flex-1">
              <p className="text-sm font-medium">
                {o.title}
                <span className="ml-2 rounded bg-neutral-100 px-1.5 text-xs font-normal">
                  {o.kind}
                </span>
              </p>
              <p className="text-xs text-neutral-500">
                Removed {o.removedBy ? `by ${o.removedBy}, ` : ''}
                {timeAgo(o.removedAt)}
              </p>
            </div>
            <form action={restoreOptionAction}>
              <HiddenIds tripId={tripId} section="shortlist" optionId={o.id} />
              <SubmitButton className={btn2}>
                <RotateCcw aria-hidden className="h-3.5 w-3.5" />
                Restore
              </SubmitButton>
            </form>
            <button
              type="button"
              disabled={purging}
              className={
                armed === o.id
                  ? 'inline-flex items-center gap-1 rounded-md border border-red-300 bg-red-50 px-2.5 py-1 text-xs font-medium text-red-700 hover:bg-red-100 disabled:opacity-50'
                  : `${btn2} inline-flex items-center gap-1`
              }
              onClick={async () => {
                if (armed !== o.id) {
                  setArmed(o.id);
                  return;
                }
                setPurging(true);
                try {
                  const fd = new FormData();
                  fd.set('tripId', tripId);
                  fd.set('section', 'shortlist');
                  fd.set('optionId', o.id);
                  await purgeOptionAction(fd);
                } catch {
                  toast.push(`Could not delete ${o.title} — please try again.`);
                } finally {
                  setPurging(false);
                  setArmed(null);
                }
              }}
            >
              <Trash2 aria-hidden className="h-3.5 w-3.5" />
              {armed === o.id ? 'Confirm delete forever' : 'Delete forever'}
            </button>
          </li>
        ))}
      </ul>
    </details>
  );
}
