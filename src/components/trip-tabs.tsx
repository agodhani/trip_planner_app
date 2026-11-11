'use client';

import Link from 'next/link';
import { CheckCircle2 } from 'lucide-react';
import { usePathname } from 'next/navigation';

const TABS = [
  { slug: '', label: 'Overview' },
  { slug: 'flights', label: 'Flights' },
  { slug: 'stay', label: 'Stay' },
  { slug: 'activities', label: 'Activities' },
  { slug: 'transport', label: 'Getting around' },
  { slug: 'itinerary', label: 'Itinerary' },
  { slug: 'shortlist', label: 'Shortlist' },
  { slug: 'budget', label: 'Budget' },
  { slug: 'log', label: 'Log' },
  { slug: 'people', label: 'People' },
];

export function TripTabs({ tripId, done = {}, shortlistCount = 0 }: {
  tripId: string;
  done?: { flights?: boolean; stay?: boolean };
  shortlistCount?: number;
}) {
  const pathname = usePathname();
  const base = `/trips/${tripId}`;
  return (
    <nav className="flex gap-1 overflow-x-auto border-b border-neutral-200" aria-label="Trip sections" data-no-print>
      {TABS.map((t) => {
        const href = t.slug ? `${base}/${t.slug}` : base;
        const active =
          t.slug === '' ? pathname === base : pathname.startsWith(href);
        const isDone = (t.slug === 'flights' && done.flights) || (t.slug === 'stay' && done.stay);
        return (
          <Link
            key={t.slug || 'overview'}
            href={href}
            aria-current={active ? 'page' : undefined}
            title={isDone ? `${t.label}: chosen` : t.slug === 'shortlist' && shortlistCount ? `${shortlistCount} shortlisted` : undefined}
            className={`flex items-center gap-1 whitespace-nowrap border-b-2 px-3 py-2 text-sm font-medium ${
              active
                ? 'border-teal-600 text-teal-700'
                : 'border-transparent text-neutral-600 hover:border-neutral-300 hover:text-neutral-900'
            }`}
          >
            {t.label}
            {isDone && <CheckCircle2 aria-hidden data-testid={`tab-done-${t.slug}`} className="h-3.5 w-3.5 text-teal-600" />}
            {t.slug === 'shortlist' && shortlistCount > 0 && (
              <span aria-hidden data-testid="tab-shortlist-count" className="rounded-full bg-teal-100 px-1.5 text-xs font-semibold text-teal-800">
                {shortlistCount}
              </span>
            )}
          </Link>
        );
      })}
    </nav>
  );
}
