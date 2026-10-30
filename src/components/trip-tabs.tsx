'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

const TABS = [
  { slug: '', label: 'Overview' },
  { slug: 'flights', label: 'Flights' },
  { slug: 'stay', label: 'Stay' },
  { slug: 'activities', label: 'Activities' },
  { slug: 'transport', label: 'Getting around' },
  { slug: 'itinerary', label: 'Itinerary' },
  { slug: 'budget', label: 'Budget' },
  { slug: 'log', label: 'Log' },
  { slug: 'people', label: 'People' },
];

export function TripTabs({ tripId }: { tripId: string }) {
  const pathname = usePathname();
  const base = `/trips/${tripId}`;
  return (
    <nav className="flex gap-1 overflow-x-auto border-b border-neutral-200" aria-label="Trip sections">
      {TABS.map((t) => {
        const href = t.slug ? `${base}/${t.slug}` : base;
        const active =
          t.slug === '' ? pathname === base : pathname.startsWith(href);
        return (
          <Link
            key={t.slug || 'overview'}
            href={href}
            className={`whitespace-nowrap border-b-2 px-3 py-2 text-sm font-medium ${
              active
                ? 'border-teal-600 text-teal-700'
                : 'border-transparent text-neutral-600 hover:border-neutral-300 hover:text-neutral-900'
            }`}
          >
            {t.label}
          </Link>
        );
      })}
    </nav>
  );
}
