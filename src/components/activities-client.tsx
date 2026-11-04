'use client';

import { useRouter } from 'next/navigation';
import { useActionState, useMemo, useState } from 'react';
import { Check, ExternalLink, Loader2, Map as MapIcon, MapPin, Search, Star } from 'lucide-react';
import { shortlistOptionAction } from '@/lib/actions/options';
import type { ActionState } from '@/lib/actions/people';
import { haversineKm, kmLabel, type GeoPoint } from '@/lib/domain/geo';
import { weekSummary } from '@/lib/domain/opening-hours';
import type { PlaceResult } from '@/lib/providers/types';
import { OptionMap, type MapPoint } from '@/components/option-map';
import { HiddenIds, ShortlistedOptions, ui, type ShortlistedOption } from '@/components/shortlisted-options';
import { SubmitButton } from '@/components/submit-button';
import { Thumb } from '@/components/thumb';
import { plural } from '@/lib/ui-format';
import type { SerpApiStatus, StayCenter } from './stay-client';

const { btn, btn2, card, inp } = ui;
const lbl = 'flex flex-col gap-1 text-xs font-medium text-neutral-600';

const CATEGORIES = [
  'Top sights', 'Museums', 'Parks & nature', 'Beaches', 'Nightlife',
  'Food & drink', 'Cafés', 'Markets & shopping', 'Tours', 'Family-friendly',
];

const CATEGORY_QUERY: Record<string, string> = {
  'Top sights': 'top sights',
  'Museums': 'museums',
  'Parks & nature': 'parks',
  'Beaches': 'beaches',
  'Nightlife': 'bars and nightlife',
  'Food & drink': 'restaurants',
  'Cafés': 'cafes',
  'Markets & shopping': 'markets and shopping',
  'Tours': 'tours and activities',
  'Family-friendly': 'family friendly activities',
};

type PlaceSort = 'rating' | 'distance' | 'price';

/** Compact comparison table; click a row to expand details. */
function PlaceTable({ items, canEdit, onShortlist, isShortlisted, isPending, nearPoint, sortBy, onSort }: {
  items: { p: PlaceResult; dist?: number }[]; canEdit: boolean; onShortlist: (p: PlaceResult) => void;
  isShortlisted: (p: PlaceResult) => boolean; isPending: (p: PlaceResult) => boolean;
  nearPoint: GeoPoint | null; sortBy: PlaceSort; onSort: (k: PlaceSort) => void;
}) {
  const [open, setOpen] = useState<string | null>(null);
  const showPrice = items.some(({ p }) => p.priceLevel !== undefined);
  const cols = 3 + (showPrice ? 1 : 0) + (nearPoint ? 1 : 0);
  const th = (label: string, k?: PlaceSort, right = false) => (
    <th className={`whitespace-nowrap px-3 py-2 font-medium ${right ? 'text-right' : 'text-left'}`}>
      {k ? (
        <button type="button" onClick={() => onSort(k)} className={`hover:text-teal-700 ${sortBy === k ? 'text-teal-700' : ''}`}>
          {label}{sortBy === k && (k === 'rating' ? ' ↓' : ' ↑')}
        </button>
      ) : label}
    </th>
  );
  return (
    <div className="overflow-x-auto rounded-xl border border-neutral-200 bg-white shadow-sm">
      <table className="w-full border-collapse text-sm">
        <thead>
          <tr className="border-b border-neutral-200 text-xs uppercase tracking-wide text-neutral-500">
            {th('Place')}{th('Rating', 'rating')}{showPrice && th('Price', 'price')}
            {nearPoint && th('Distance', 'distance', true)}<th><span className="sr-only">Actions</span></th>
          </tr>
        </thead>
        <tbody>
          {items.map(({ p, dist }) => [
            <tr
              key={p.id}
              onClick={() => setOpen(open === p.id ? null : p.id)}
              className="cursor-pointer border-b border-neutral-100 align-top hover:bg-teal-50/50"
            >
              <td className="px-3 py-2">
                <span className="flex items-center gap-2.5">
                  <Thumb src={p.thumbnail} icon={MapPin} className="h-10 w-10" />
                  <span>
                    <span className="font-medium">{p.title}</span>
                    <span className="block text-xs text-neutral-500">{p.types.slice(0, 2).join(' · ')}</span>
                  </span>
                </span>
              </td>
              <td className="whitespace-nowrap px-3 py-2">
                {p.rating !== undefined
                  ? <><span className="inline-flex items-center gap-0.5 font-medium"><Star aria-hidden className="h-3.5 w-3.5 fill-amber-400 text-amber-400" />{p.rating}</span>
                      <span className="block text-xs text-neutral-500">{plural(p.reviews ?? 0, 'review')}</span></>
                  : <span className="text-xs text-neutral-400">No rating</span>}
              </td>
              {showPrice && (
                <td className="whitespace-nowrap px-3 py-2 text-xs">
                  {p.priceLevel !== undefined ? '$'.repeat(Math.max(1, p.priceLevel)) : '—'}
                </td>
              )}
              {nearPoint && (
                <td className="whitespace-nowrap px-3 py-2 text-right text-xs text-neutral-600">
                  {dist !== undefined ? kmLabel(dist) : '—'}
                </td>
              )}
              <td className="px-3 py-2">
                <span className="flex items-center justify-end gap-1.5 whitespace-nowrap" onClick={(e) => e.stopPropagation()}>
                  {canEdit && (isShortlisted(p) ? (
                    <span className="inline-flex items-center gap-1 rounded-md bg-teal-50 px-2 py-1 text-xs font-medium text-teal-700">
                      <Check aria-hidden className="h-3.5 w-3.5" /> Shortlisted
                    </span>
                  ) : (
                    <button type="button" className={`${btn2} inline-flex items-center gap-1`} disabled={isPending(p)} onClick={() => onShortlist(p)}>
                      {isPending(p) && <Loader2 aria-hidden className="h-3 w-3 animate-spin" />}Shortlist
                    </button>
                  ))}
                  {p.website && (
                    <a href={p.website} target="_blank" rel="noopener noreferrer" className={`${btn2} inline-flex items-center gap-1`}>
                      Site <ExternalLink aria-hidden className="h-3 w-3" />
                    </a>
                  )}
                </span>
              </td>
            </tr>,
            open === p.id && (
              <tr key={`${p.id}-detail`} className="border-b border-neutral-200 bg-neutral-50">
                <td colSpan={cols} className="px-3 py-2 text-xs text-neutral-600">
                  {p.address && <p>{p.address}</p>}
                  {p.description && <p className="mt-0.5">{p.description}</p>}
                  {p.phone && <p className="mt-0.5">{p.phone}</p>}
                  {weekSummary(p.hours) && <p className="mt-0.5">Hours: {weekSummary(p.hours)}</p>}
                  {!p.address && !p.description && !p.phone && !weekSummary(p.hours) && <p>No extra details from Google Maps.</p>}
                </td>
              </tr>
            ),
          ])}
        </tbody>
      </table>
    </div>
  );
}

export function ActivitiesClient({
  tripId, canEdit, centers, serpApi, options,
}: {
  tripId: string;
  canEdit: boolean;
  centers: StayCenter[];
  serpApi: SerpApiStatus;
  options: ShortlistedOption[];
}) {
  const router = useRouter();
  const [query, setQuery] = useState('');
  const [activeCategory, setActiveCategory] = useState<string | null>(null);
  const [nearKey, setNearKey] = useState('destination');
  const [pin, setPin] = useState<GeoPoint | null>(null);
  const [minRating, setMinRating] = useState(0);
  const [minReviews, setMinReviews] = useState(0);
  const [maxPrice, setMaxPrice] = useState(0);
  const [radiusKm, setRadiusKm] = useState(0);
  const [sortBy, setSortBy] = useState<PlaceSort>('rating');
  const [showMap, setShowMap] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<{ kind: string; message: string } | null>(null);
  const [results, setResults] = useState<PlaceResult[] | null>(null);
  const [pending, setPending] = useState<Set<string>>(new Set());
  const [manualOpen, setManualOpen] = useState(false);
  const [mState, mAction] = useActionState<ActionState, FormData>(async (_p, fd) => {
    fd.set('kind', 'activity');
    fd.set('source', 'manual');
    fd.set('title', String(fd.get('name')));
    if (fd.get('address')) fd.set('subtitle', String(fd.get('address')));
    const data = {
      id: `manual:${fd.get('name')}`,
      title: fd.get('name'), types: fd.get('address') ? [String(fd.get('address'))] : [],
      address: fd.get('address') || undefined,
      lat: fd.get('lat') ? Number(fd.get('lat')) : undefined,
      lon: fd.get('lon') ? Number(fd.get('lon')) : undefined,
      website: fd.get('url') || undefined,
    };
    fd.set('data', JSON.stringify(data));
    if (fd.get('url')) fd.set('bookingUrl', String(fd.get('url')));
    if (fd.get('lat')) fd.set('lat', String(fd.get('lat')));
    if (fd.get('lon')) fd.set('lon', String(fd.get('lon')));
    return shortlistOptionAction(fd);
  }, {});

  const nearPoint: GeoPoint | null = useMemo(() => {
    if (nearKey === 'pin') return pin;
    return centers.find((c) => c.key === nearKey)?.point ?? centers[0]?.point ?? null;
  }, [nearKey, pin, centers]);
  const nearLabel = nearKey === 'pin' ? 'your pin' : centers.find((c) => c.key === nearKey)?.label ?? 'centre';

  async function search(q: string, category?: string) {
    const text = q.trim();
    if (!text) return;
    setLoading(true); setError(null);
    if (category) setActiveCategory(category);
    const p = new URLSearchParams({ q: text });
    if (nearPoint) { p.set('lat', String(nearPoint.lat)); p.set('lon', String(nearPoint.lon)); }
    try {
      const res = await fetch(`/api/trips/${tripId}/activities?${p}`);
      const data = await res.json();
      if (!res.ok) { setError(data.error ?? { kind: 'error', message: 'Search failed' }); return; }
      setResults(data.places ?? []);
    } catch {
      setError({ kind: 'network', message: 'Request failed' });
    } finally {
      setLoading(false);
    }
  }

  const shortlistedKeys = new Set(options.map((o) => o.externalId).filter((k): k is string => !!k));

  async function shortlist(p: PlaceResult) {
    setPending((s) => new Set(s).add(p.id));
    const fd = new FormData();
    fd.set('tripId', tripId); fd.set('section', 'activities');
    fd.set('kind', 'activity'); fd.set('source', 'serpapi_google_maps');
    fd.set('externalId', p.id);
    fd.set('title', p.title);
    fd.set('subtitle', [
      p.types[0] ?? null,
      p.rating !== undefined ? `${p.rating} (${p.reviews ?? 0} reviews)` : null,
      p.address ?? null,
    ].filter(Boolean).join(' · '));
    fd.set('data', JSON.stringify(p));
    if (p.lat !== undefined) fd.set('lat', String(p.lat));
    if (p.lon !== undefined) fd.set('lon', String(p.lon));
    if (p.website) fd.set('bookingUrl', p.website);
    try {
      const r = await shortlistOptionAction(fd);
      if (r?.error) setError({ kind: 'input', message: r.error });
      router.refresh();
    } catch {
      setError({ kind: 'error', message: 'Could not shortlist — please try again.' });
    } finally {
      setPending((s) => { const n = new Set(s); n.delete(p.id); return n; });
    }
  }

  const visible = useMemo(() => {
    const list = (results ?? []).filter((p) =>
      (minRating === 0 || (p.rating ?? 0) >= minRating) &&
      (minReviews === 0 || (p.reviews ?? 0) >= minReviews) &&
      (maxPrice === 0 || p.priceLevel === undefined || p.priceLevel <= maxPrice) &&
      (radiusKm === 0 || !nearPoint || (p.lat !== undefined && p.lon !== undefined &&
        haversineKm(nearPoint.lat, nearPoint.lon, p.lat, p.lon) <= radiusKm)));
    const withDist = list.map((p) => ({
      p,
      dist: nearPoint && p.lat !== undefined && p.lon !== undefined
        ? haversineKm(nearPoint.lat, nearPoint.lon, p.lat, p.lon) : undefined,
    }));
    return withDist.sort((a, b) =>
      sortBy === 'distance' ? (a.dist ?? 1e15) - (b.dist ?? 1e15)
      : sortBy === 'price' ? (a.p.priceLevel ?? 1e15) - (b.p.priceLevel ?? 1e15)
      : (b.p.rating ?? -1) - (a.p.rating ?? -1));
  }, [results, minRating, minReviews, maxPrice, radiusKm, nearPoint, sortBy]);

  const mapPoints: MapPoint[] = visible
    .filter(({ p }) => p.lat !== undefined && p.lon !== undefined)
    .map(({ p }) => ({ id: p.id, lat: p.lat!, lon: p.lon!, title: p.title, subtitle: p.types[0], tone: 'default' }));
  if (nearPoint) mapPoints.unshift({ id: '__center', lat: nearPoint.lat, lon: nearPoint.lon, title: 'Search centre', tone: 'center' });
  if (pin) mapPoints.unshift({ id: '__pin', lat: pin.lat, lon: pin.lon, title: 'Dropped pin', tone: 'pin' });

  const configured = serpApi.status === 'ok';

  return (
    <div className="flex flex-col gap-6">
      <section className={card}>
        {!configured && serpApi.status === 'not_configured' && (
          <div className="mb-3 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">
            <p className="font-medium">Connect SerpApi (free) to search activities</p>
            <p className="mt-1 text-xs">Sign up at serpapi.com (email + phone, no card — 250 searches/month free), copy your API key, add <code>SERPAPI_API_KEY=…</code> to <code>.env.local</code>, and restart. Manual entry below works either way.</p>
          </div>
        )}
        {serpApi.status === 'error' && (
          <p className="mb-3 rounded bg-red-50 px-3 py-2 text-sm text-red-700">SerpApi error ({serpApi.kind}): {serpApi.message} — manual entry is available.</p>
        )}
        <p className="mb-2 text-xs font-medium text-neutral-600">Pick a category</p>
        <div className="flex flex-wrap items-center gap-1.5 text-xs">
          {CATEGORIES.map((c) => (
            <button
              key={c} type="button" disabled={!configured || loading} aria-pressed={activeCategory === c}
              onClick={() => { setQuery(CATEGORY_QUERY[c]); void search(CATEGORY_QUERY[c], c); }}
              className={`rounded-full border px-3 py-1 disabled:opacity-50 ${activeCategory === c ? 'border-teal-600 bg-teal-50 text-teal-700' : 'border-neutral-300 text-neutral-700 hover:bg-neutral-100'}`}
            >{c}</button>
          ))}
        </div>
        <form
          className="mt-3 flex flex-wrap items-end gap-2 text-sm"
          onSubmit={(e) => { e.preventDefault(); void search(query); }}
        >
          <label className={`${lbl} min-w-64 flex-1`}>…or search anything
            <input value={query} onChange={(e) => { setQuery(e.target.value); setActiveCategory(null); }} placeholder="e.g. street art tours, rooftop bars" className={inp} />
          </label>
          <label className={lbl}>Near
            <select value={nearKey} onChange={(e) => setNearKey(e.target.value)} className={inp}>
              {centers.map((c) => <option key={c.key} value={c.key}>{c.label}</option>)}
              <option value="pin">Dropped pin</option>
            </select>
          </label>
          <button type="submit" disabled={!configured || loading || !query.trim()} className={`${btn} inline-flex items-center gap-1.5`}>
            {loading ? <Loader2 aria-hidden className="h-4 w-4 animate-spin" /> : <Search aria-hidden className="h-4 w-4" />}
            Search
          </button>
          {canEdit && <button type="button" className={btn2} onClick={() => setManualOpen((v) => !v)} aria-expanded={manualOpen}>Add manually</button>}
        </form>
        <p className="mt-2 text-xs text-neutral-500">
          {configured ? `Each search uses 1 of your ${serpApi.searchesLeft ?? '–'} SerpApi searches left; the filters on the results are free.` : 'Manual entry works without SerpApi.'}
        </p>
        {error && (
          <p className="mt-2 rounded bg-amber-50 px-3 py-2 text-sm text-amber-800" role="alert">
            {error.kind === 'not_configured' ? 'SerpApi is not configured — see the card above.' : error.kind === 'quota_exceeded' ? 'SerpApi monthly quota is used up — add activities manually.' : error.message}
          </p>
        )}
      </section>

      {manualOpen && canEdit && (
        <section className={card}>
          <h2 className="font-semibold">Add an activity manually</h2>
          <p className="mb-3 text-xs text-neutral-500">A restaurant booking, a friend&apos;s tip, a ticketed show — add it to the shortlist.</p>
          <form action={mAction} className="grid grid-cols-2 gap-3 text-sm sm:grid-cols-4">
            <HiddenIds tripId={tripId} section="activities" optionId="manual" />
            <label className={`${lbl} col-span-2`}>Name<input name="name" placeholder="Activity name" required className={inp} /></label>
            <label className={`${lbl} col-span-2`}>Address or area<input name="address" className={inp} /></label>
            <label className={`${lbl} col-span-2`}>Website<input name="url" type="url" placeholder="https://" className={inp} /></label>
            <label className={lbl}>Latitude (for the map)<input name="lat" inputMode="decimal" className={inp} /></label>
            <label className={lbl}>Longitude<input name="lon" inputMode="decimal" className={inp} /></label>
            <div className="flex items-end"><SubmitButton className={btn}>Add</SubmitButton></div>
            {mState.error && <p role="alert" className="col-span-full text-sm text-red-600">{mState.error}</p>}
          </form>
        </section>
      )}

      {results !== null && (
        <section className="flex flex-col gap-3">
          <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-sm">
            <p className="font-medium text-neutral-800">{visible.length} of {results.length} places</p>
            <span className="flex flex-wrap items-center gap-2 text-xs text-neutral-600">
              <span className="font-medium">Refine instantly:</span>
              <select value={minRating} onChange={(e) => setMinRating(Number(e.target.value))} className={inp} aria-label="Minimum rating">
                <option value="0">Any rating</option><option value="4">4.0+</option><option value="4.5">4.5+</option>
              </select>
              <select value={minReviews} onChange={(e) => setMinReviews(Number(e.target.value))} className={inp} aria-label="Minimum reviews">
                <option value="0">Any reviews</option><option value="50">50+ reviews</option><option value="200">200+ reviews</option><option value="1000">1000+ reviews</option>
              </select>
              <select value={maxPrice} onChange={(e) => setMaxPrice(Number(e.target.value))} className={inp} aria-label="Maximum price">
                <option value="0">Any price</option><option value="1">$</option><option value="2">$$ or less</option><option value="3">$$$ or less</option>
              </select>
              <select value={radiusKm} onChange={(e) => setRadiusKm(Number(e.target.value))} className={inp} aria-label="Maximum distance">
                <option value="0">Any distance</option><option value="1">Within 1 km</option><option value="2">Within 2 km</option><option value="5">Within 5 km</option><option value="10">Within 10 km</option>
              </select>
              <button type="button" className={`${btn2} inline-flex items-center gap-1`} onClick={() => setShowMap((v) => !v)} aria-pressed={showMap}>
                <MapIcon aria-hidden className="h-3.5 w-3.5" />{showMap ? 'Hide map' : 'Map'}
              </button>
            </span>
          </div>
          {nearPoint && <p className="text-xs text-neutral-500">Distances are from {nearLabel}. Click a row for the address and details.</p>}
          {showMap && (
            <div>
              <OptionMap points={mapPoints} onPick={(lat, lon) => { setPin({ lat, lon }); setNearKey('pin'); }} />
              <p className="mt-1 text-xs text-neutral-500">Click the map to drop a pin, then search near it.</p>
            </div>
          )}
          {visible.length > 0 && (
            <PlaceTable
              items={visible} canEdit={canEdit} onShortlist={shortlist}
              isShortlisted={(p) => shortlistedKeys.has(p.id)} isPending={(p) => pending.has(p.id)}
              nearPoint={nearPoint} sortBy={sortBy} onSort={setSortBy}
            />
          )}
          {visible.length === 0 && <p className="text-sm text-neutral-500">No places match — loosen the filters.</p>}
        </section>
      )}

      <ShortlistedOptions tripId={tripId} section="activities" title="Shortlisted activities" canEdit={canEdit} options={options} />
    </div>
  );
}
