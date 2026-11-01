'use client';

import { useRouter } from 'next/navigation';
import { useActionState, useMemo, useState } from 'react';
import { BedDouble, Check, ExternalLink, Info, Loader2, Map as MapIcon, Star } from 'lucide-react';
import { shortlistOptionAction } from '@/lib/actions/options';
import type { ActionState } from '@/lib/actions/people';
import { haversineKm, kmLabel, type GeoPoint } from '@/lib/domain/geo';
import { scoreLodgings, type Scored } from '@/lib/domain/stay';
import type { LodgingResult } from '@/lib/providers/types';
import { AMENITY_IDS, NON_HOSTEL_TYPE_IDS, PROPERTY_TYPES, HOTEL_RATING } from '@/lib/providers/serpapi/hotel-filters';
import { OptionMap, type MapPoint } from '@/components/option-map';
import { HiddenIds, ShortlistedOptions, ui, type ShortlistedOption } from '@/components/shortlisted-options';
import { SubmitButton } from '@/components/submit-button';
import { Thumb } from '@/components/thumb';
import { dayLabel, money, nightsBetween, plural } from '@/lib/ui-format';

const { btn, btn2, card, inp } = ui;
const lbl = 'flex flex-col gap-1 text-xs font-medium text-neutral-600';
const chip = (on: boolean) =>
  `rounded-full border px-2.5 py-1 text-xs ${on ? 'border-teal-600 bg-teal-50 text-teal-700' : 'border-neutral-300 text-neutral-700 hover:bg-neutral-100'}`;

export type StayCenter = { key: string; label: string; point: GeoPoint };
export type StayDates = { checkIn: string; checkOut: string; source: 'flight' | 'trip' | 'strategy' };
export type SerpApiStatus =
  | { status: 'ok'; searchesLeft: number | null }
  | { status: 'not_configured' }
  | { status: 'error'; kind: string; message: string };

const AMENITY_CHOICES = [
  ['Free Wi-Fi', AMENITY_IDS.freeWifi],
  ['Free breakfast', AMENITY_IDS.freeBreakfast],
  ['Pool', AMENITY_IDS.pool],
  ['Parking', AMENITY_IDS.parking],
  ['Air-conditioned', AMENITY_IDS.airConditioned],
  ['Fitness', AMENITY_IDS.fitness],
  ['Pet-friendly', AMENITY_IDS.petFriendly],
  ['Beach access', AMENITY_IDS.beachAccess],
] as const;

const KINDS = [
  ['any', 'Any'], ['no_hostels', 'Hotels & B&Bs (no hostels)'], ['hostels', 'Hostels'], ['vacation', 'Vacation rentals'],
] as const;
type Kind = (typeof KINDS)[number][0];

const DATE_SOURCE: Record<StayDates['source'], string> = {
  flight: 'from your selected flight', trip: 'from your trip dates', strategy: 'from your date plan',
};

type StaySort = 'score' | 'price' | 'rating';

/** Compact comparison table; click a row to expand details. */
function LodgingTable({ items, canEdit, onShortlist, isShortlisted, isPending, topIds, nearPoint, sortBy, onSort }: {
  items: Scored<LodgingResult>[]; canEdit: boolean; onShortlist: (l: LodgingResult) => void;
  isShortlisted: (l: LodgingResult) => boolean; isPending: (l: LodgingResult) => boolean;
  topIds: Set<string>; nearPoint: GeoPoint | null; sortBy: StaySort; onSort: (k: StaySort) => void;
}) {
  const [open, setOpen] = useState<string | null>(null);
  const th = (label: string, k?: StaySort, right = false) => (
    <th className={`whitespace-nowrap px-3 py-2 font-medium ${right ? 'text-right' : 'text-left'}`}>
      {k ? (
        <button type="button" onClick={() => onSort(k)} className={`hover:text-teal-700 ${sortBy === k ? 'text-teal-700' : ''}`}>
          {label}{sortBy === k && (k === 'price' ? ' ↑' : ' ↓')}
        </button>
      ) : label}
    </th>
  );
  return (
    <div className="overflow-x-auto rounded-xl border border-neutral-200 bg-white shadow-sm">
      <table className="w-full border-collapse text-sm">
        <thead>
          <tr className="border-b border-neutral-200 text-xs uppercase tracking-wide text-neutral-500">
            {th('Stay')}{th('Rating', 'rating')}{th('Score', 'score', true)}{th('Price', 'price', true)}
            {nearPoint && th('Distance', undefined, true)}<th><span className="sr-only">Actions</span></th>
          </tr>
        </thead>
        <tbody>
          {items.map((l) => {
            const dist = nearPoint && l.lat !== undefined && l.lon !== undefined
              ? haversineKm(nearPoint.lat, nearPoint.lon, l.lat, l.lon) : undefined;
            return [
              <tr
                key={l.id}
                onClick={() => setOpen(open === l.id ? null : l.id)}
                className="cursor-pointer border-b border-neutral-100 align-top hover:bg-teal-50/50"
              >
                <td className="px-3 py-2">
                  <span className="flex items-center gap-2.5">
                    <Thumb src={l.images[0]} icon={BedDouble} className="h-10 w-14" />
                    <span>
                      <span className="font-medium">{l.name}</span>
                      {topIds.has(l.id) && <span className="ml-1.5 rounded bg-teal-100 px-1 text-xs font-medium text-teal-700">Top pick</span>}
                      <span className="block text-xs text-neutral-500">
                        {l.hotelClass ? `${l.hotelClass}-star ` : ''}
                        {l.isHostel ? 'hostel' : l.kind === 'vacation_rental' ? 'rental' : 'hotel'}
                        {l.reasons[0] ? ` · ${l.reasons[0]}` : ''}
                      </span>
                    </span>
                  </span>
                </td>
                <td className="whitespace-nowrap px-3 py-2">
                  {l.rating !== undefined
                    ? <><span className="inline-flex items-center gap-0.5 font-medium"><Star aria-hidden className="h-3.5 w-3.5 fill-amber-400 text-amber-400" />{l.rating}</span>
                        <span className="block text-xs text-neutral-500">{plural(l.reviews ?? 0, 'review')}</span></>
                    : <span className="text-xs text-neutral-400">No rating</span>}
                </td>
                <td className="whitespace-nowrap px-3 py-2 text-right">
                  <span className={`rounded px-1.5 py-0.5 text-xs font-semibold ${l.score >= 75 ? 'bg-teal-100 text-teal-800' : 'bg-neutral-100 text-neutral-600'}`}>{l.score}</span>
                </td>
                <td className="whitespace-nowrap px-3 py-2 text-right">
                  {l.pricePerNight !== undefined
                    ? <><span className="text-base font-semibold">{money(l.pricePerNight, l.currency)}</span><span className="text-xs text-neutral-500"> /night</span></>
                    : <span className="text-xs text-neutral-400">No price</span>}
                  {l.totalPrice !== undefined && <span className="block text-xs text-neutral-500">{money(l.totalPrice, l.currency)} total</span>}
                </td>
                {nearPoint && <td className="whitespace-nowrap px-3 py-2 text-right text-xs text-neutral-600">{dist !== undefined ? kmLabel(dist) : '—'}</td>}
                <td className="px-3 py-2">
                  <span className="flex items-center justify-end gap-1.5 whitespace-nowrap" onClick={(e) => e.stopPropagation()}>
                    {canEdit && (isShortlisted(l) ? (
                      <span className="inline-flex items-center gap-1 rounded-md bg-teal-50 px-2 py-1 text-xs font-medium text-teal-700">
                        <Check aria-hidden className="h-3.5 w-3.5" /> Shortlisted
                      </span>
                    ) : (
                      <button type="button" className={`${btn2} inline-flex items-center gap-1`} disabled={isPending(l)} onClick={() => onShortlist(l)}>
                        {isPending(l) && <Loader2 aria-hidden className="h-3 w-3 animate-spin" />}Shortlist
                      </button>
                    ))}
                    {l.link && (
                      <a href={l.link} target="_blank" rel="noopener noreferrer" className={`${btn2} inline-flex items-center gap-1`}>
                        Site <ExternalLink aria-hidden className="h-3 w-3" />
                      </a>
                    )}
                  </span>
                </td>
              </tr>,
              open === l.id && (
                <tr key={`${l.id}-detail`} className="border-b border-neutral-200 bg-neutral-50">
                  <td colSpan={nearPoint ? 6 : 5} className="px-3 py-2 text-xs text-neutral-600">
                    {l.description && <p>{l.description}</p>}
                    {l.reasons.length > 0 && <p className="mt-0.5 text-teal-700">Why this score: {l.reasons.join(' · ')}</p>}
                    {l.locationRating !== undefined && <p className="mt-0.5">Location rating {l.locationRating}/5</p>}
                    {l.nearbyPlaces.length > 0 && <p className="mt-0.5">Near {l.nearbyPlaces.slice(0, 3).join(', ')}</p>}
                    {l.amenities.length > 0 && <p className="mt-0.5">{l.amenities.join(' · ')}</p>}
                    {(l.checkInTime || l.checkOutTime) && (
                      <p className="mt-0.5">Check-in {l.checkInTime ?? '—'} · check-out {l.checkOutTime ?? '—'}</p>
                    )}
                  </td>
                </tr>
              ),
            ];
          })}
        </tbody>
      </table>
    </div>
  );
}

export function StayClient({
  tripId, canEdit, dates, centers, serpApi, currency, options,
}: {
  tripId: string;
  canEdit: boolean;
  dates: StayDates | null;
  centers: StayCenter[];
  serpApi: SerpApiStatus;
  currency: string;
  options: ShortlistedOption[];
}) {
  const router = useRouter();
  const [checkIn, setCheckIn] = useState(dates?.checkIn ?? '');
  const [checkOut, setCheckOut] = useState(dates?.checkOut ?? '');
  const [area, setArea] = useState('');
  const [kind, setKind] = useState<Kind>('any');
  const [minPrice, setMinPrice] = useState('');
  const [maxPrice, setMaxPrice] = useState('');
  const [minRating, setMinRating] = useState('0');
  const [classes, setClasses] = useState<Set<number>>(new Set());
  const [amenities, setAmenities] = useState<Set<number>>(new Set());
  const [freeCancel, setFreeCancel] = useState(false);
  const [nearKey, setNearKey] = useState('destination');
  const [pin, setPin] = useState<GeoPoint | null>(null);
  const [radiusKm, setRadiusKm] = useState(0);
  const [sortBy, setSortBy] = useState<StaySort>('score');
  const [showMap, setShowMap] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<{ kind: string; message: string } | null>(null);
  const [results, setResults] = useState<Scored<LodgingResult>[] | null>(null);
  const [ads, setAds] = useState<LodgingResult[]>([]);
  const [searched, setSearched] = useState<{ checkIn: string; checkOut: string; params: string } | null>(null);
  const [pending, setPending] = useState<Set<string>>(new Set());
  const [manualOpen, setManualOpen] = useState(false);
  const [mState, mAction] = useActionState<ActionState, FormData>(async (_p, fd) => {
    fd.set('kind', 'lodging');
    fd.set('source', 'manual');
    fd.set('title', String(fd.get('name')));
    const sub = [fd.get('checkInOut'), fd.get('address')].filter(Boolean).join(' · ');
    if (sub) fd.set('subtitle', sub);
    const price = fd.get('totalPrice');
    if (price) { fd.set('priceAmount', String(price)); fd.set('priceCurrency', currency); }
    const data = {
      id: `manual:${fd.get('name')}:${fd.get('checkInOut') ?? ''}`,
      name: fd.get('name'), kind: 'hotel',
      description: fd.get('address') || undefined,
      lat: fd.get('lat') ? Number(fd.get('lat')) : undefined,
      lon: fd.get('lon') ? Number(fd.get('lon')) : undefined,
      totalPrice: price ? Number(price) : undefined,
      currency, amenities: [], nearbyPlaces: [], images: [],
      link: fd.get('url') || undefined,
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

  const params = new URLSearchParams({ check_in: checkIn, check_out: checkOut });
  if (area.trim()) params.set('area', area.trim());
  if (kind === 'no_hostels') params.set('property_types', NON_HOSTEL_TYPE_IDS.join(','));
  if (kind === 'hostels') params.set('property_types', String(PROPERTY_TYPES.hostel));
  if (kind === 'vacation') params.set('vacation_rentals', '1');
  if (minPrice) params.set('min_price', minPrice);
  if (maxPrice) params.set('max_price', maxPrice);
  if (minRating !== '0') params.set('rating', String(HOTEL_RATING[minRating as keyof typeof HOTEL_RATING] ?? ''));
  if (classes.size) params.set('hotel_class', [...classes].sort().join(','));
  if (amenities.size) params.set('amenities', [...amenities].join(','));
  if (freeCancel) params.set('free_cancellation', '1');
  const paramString = params.toString();
  const filtersChanged = results !== null && searched !== null && searched.params !== paramString;

  async function search() {
    setLoading(true); setError(null);
    try {
      const res = await fetch(`/api/trips/${tripId}/stay?${paramString}`);
      const data = await res.json();
      if (!res.ok) { setError(data.error ?? { kind: 'error', message: 'Search failed' }); return; }
      setResults(scoreLodgings(data.lodgings ?? []));
      setAds(data.ads ?? []);
      setSearched({ checkIn, checkOut, params: paramString });
    } catch {
      setError({ kind: 'network', message: 'Request failed' });
    } finally {
      setLoading(false);
    }
  }

  // Shortlisted entries are keyed by the dates the prices were searched for.
  const keyOf = (l: LodgingResult) => `${l.id}:${searched?.checkIn ?? checkIn}:${searched?.checkOut ?? checkOut}`;
  const shortlistedKeys = new Set(options.map((o) => o.externalId).filter((k): k is string => !!k));

  async function shortlist(l: LodgingResult) {
    const key = keyOf(l);
    const ci = searched?.checkIn ?? checkIn, co = searched?.checkOut ?? checkOut;
    setPending((s) => new Set(s).add(key));
    const fd = new FormData();
    fd.set('tripId', tripId); fd.set('section', 'stay');
    fd.set('kind', 'lodging'); fd.set('source', 'serpapi_google_hotels');
    fd.set('externalId', key);
    fd.set('title', l.name);
    fd.set('subtitle', [
      `${dayLabel(ci)} – ${dayLabel(co)}`,
      l.hotelClass ? `${l.hotelClass}-star` : null,
      l.rating !== undefined ? `${l.rating} (${l.reviews ?? 0} reviews)` : null,
      l.pricePerNight !== undefined ? `${money(l.pricePerNight, l.currency)}/night` : null,
    ].filter(Boolean).join(' · '));
    fd.set('data', JSON.stringify({ ...l, checkIn: ci, checkOut: co }));
    if (l.totalPrice !== undefined) { fd.set('priceAmount', String(l.totalPrice)); fd.set('priceCurrency', l.currency ?? currency); }
    if (l.lat !== undefined) fd.set('lat', String(l.lat));
    if (l.lon !== undefined) fd.set('lon', String(l.lon));
    if (l.link) fd.set('bookingUrl', l.link);
    try {
      const r = await shortlistOptionAction(fd);
      if (r?.error) setError({ kind: 'input', message: r.error });
      router.refresh();
    } catch {
      setError({ kind: 'error', message: 'Could not shortlist — please try again.' });
    } finally {
      setPending((s) => { const n = new Set(s); n.delete(key); return n; });
    }
  }

  const visible = useMemo(() => {
    const list = results ?? [];
    const filtered = radiusKm > 0 && nearPoint
      ? list.filter((l) => l.lat !== undefined && l.lon !== undefined && haversineKm(nearPoint.lat, nearPoint.lon, l.lat, l.lon) <= radiusKm)
      : list;
    return [...filtered].sort((a, b) =>
      sortBy === 'score' ? b.score - a.score
      : sortBy === 'price' ? (a.pricePerNight ?? 1e15) - (b.pricePerNight ?? 1e15)
      : (b.rating ?? -1) - (a.rating ?? -1));
  }, [results, radiusKm, nearPoint, sortBy]);
  const topIds = useMemo(
    () => new Set([...(results ?? [])].sort((a, b) => b.score - a.score).slice(0, 3).map((l) => l.id)),
    [results],
  );

  const mapPoints: MapPoint[] = visible
    .filter((l) => l.lat !== undefined && l.lon !== undefined)
    .map((l) => ({ id: l.id, lat: l.lat!, lon: l.lon!, title: l.name, subtitle: l.pricePerNight !== undefined ? `${money(l.pricePerNight, l.currency)}/night · score ${l.score}` : `score ${l.score}`, tone: topIds.has(l.id) ? 'top' as const : 'default' as const }));
  if (nearPoint) mapPoints.unshift({ id: '__center', lat: nearPoint.lat, lon: nearPoint.lon, title: 'Search centre', tone: 'center' });
  if (pin) mapPoints.unshift({ id: '__pin', lat: pin.lat, lon: pin.lon, title: 'Dropped pin', tone: 'pin' });

  const configured = serpApi.status === 'ok';
  const nights = checkIn && checkOut ? nightsBetween(checkIn, checkOut) : 0;
  const datesInvalid = !checkIn || !checkOut || checkOut <= checkIn;
  const toggle = (set: React.Dispatch<React.SetStateAction<Set<number>>>, v: number) =>
    set((s) => { const n = new Set(s); if (n.has(v)) n.delete(v); else n.add(v); return n; });

  return (
    <div className="flex flex-col gap-6">
      <section className={card}>
        {!configured && serpApi.status === 'not_configured' && (
          <div className="mb-3 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">
            <p className="font-medium">Connect SerpApi (free) to search stays</p>
            <p className="mt-1 text-xs">Sign up at serpapi.com (email + phone, no card — 250 searches/month free), copy your API key, add <code>SERPAPI_API_KEY=…</code> to <code>.env.local</code>, and restart. Manual entry below works either way.</p>
          </div>
        )}
        {serpApi.status === 'error' && (
          <p className="mb-3 rounded bg-red-50 px-3 py-2 text-sm text-red-700">SerpApi error ({serpApi.kind}): {serpApi.message} — manual entry is available.</p>
        )}

        <div className="flex flex-wrap items-end gap-3">
          <label className={lbl}>Check-in
            <input type="date" value={checkIn} onChange={(e) => setCheckIn(e.target.value)} className={inp} />
          </label>
          <label className={lbl}>Check-out
            <input type="date" value={checkOut} onChange={(e) => setCheckOut(e.target.value)} className={inp} />
          </label>
          <p className="pb-1.5 text-xs text-neutral-500">
            {nights > 0 ? `${plural(nights, 'night')}${dates && checkIn === dates.checkIn && checkOut === dates.checkOut ? ` · ${DATE_SOURCE[dates.source]}` : ''}` : 'Pick check-in and check-out'}
          </p>
          <label className={`${lbl} min-w-48 flex-1`}>Neighbourhood (optional)
            <input value={area} onChange={(e) => setArea(e.target.value)} placeholder="e.g. Alfama, Baixa" className={inp} />
          </label>
        </div>

        <div className="mt-3">
          <p className="mb-1 text-xs font-medium text-neutral-600">Type of stay</p>
          <div className="flex flex-wrap gap-1.5" role="group" aria-label="Type of stay">
            {KINDS.map(([k, label]) => (
              <button key={k} type="button" aria-pressed={kind === k} className={chip(kind === k)} onClick={() => setKind(k)}>{label}</button>
            ))}
          </div>
        </div>

        <div className="mt-3 flex flex-wrap items-end gap-3">
          <label className={lbl}>{currency} per night
            <span className="flex items-center gap-1">
              <input value={minPrice} onChange={(e) => setMinPrice(e.target.value.replace(/\D/g, ''))} placeholder="min" aria-label="Minimum price per night" className={`${inp} w-20`} />
              –
              <input value={maxPrice} onChange={(e) => setMaxPrice(e.target.value.replace(/\D/g, ''))} placeholder="max" aria-label="Maximum price per night" className={`${inp} w-20`} />
            </span>
          </label>
          <label className={lbl}>Guest rating
            <select value={minRating} onChange={(e) => setMinRating(e.target.value)} className={inp}>
              <option value="0">Any</option><option value="3.5+">3.5+</option><option value="4.0+">4.0+</option><option value="4.5+">4.5+</option>
            </select>
          </label>
          <label className="flex items-center gap-1.5 pb-1.5 text-xs text-neutral-700">
            <input type="checkbox" checked={freeCancel} onChange={(e) => setFreeCancel(e.target.checked)} className="accent-teal-600" />Free cancellation
          </label>
        </div>

        <div className="mt-3">
          <p className="mb-1 text-xs font-medium text-neutral-600">Must-haves</p>
          <div className="flex flex-wrap gap-1.5">
            {[2, 3, 4, 5].map((c) => (
              <button key={c} type="button" aria-pressed={classes.has(c)} className={chip(classes.has(c))} onClick={() => toggle(setClasses, c)}>{c}-star</button>
            ))}
            <span className="mx-1 self-center text-neutral-300">|</span>
            {AMENITY_CHOICES.map(([label, id]) => (
              <button key={id} type="button" aria-pressed={amenities.has(id)} className={chip(amenities.has(id))} onClick={() => toggle(setAmenities, id)}>{label}</button>
            ))}
          </div>
        </div>

        <div className="mt-4 flex flex-wrap items-center gap-3 border-t border-neutral-100 pt-3">
          <button type="button" disabled={!configured || loading || datesInvalid} className={`${btn} inline-flex items-center gap-1.5 ${filtersChanged ? 'ring-2 ring-amber-400' : ''}`} onClick={search}>
            {loading && <Loader2 aria-hidden className="h-4 w-4 animate-spin" />}
            {loading ? 'Searching…' : 'Search stays'}
          </button>
          {canEdit && <button type="button" className={btn2} onClick={() => setManualOpen((v) => !v)} aria-expanded={manualOpen}>Add manually</button>}
          {filtersChanged && <span className="text-xs font-medium text-amber-700">Filters changed — search again to apply them</span>}
          <span className="ml-auto text-xs text-neutral-500">
            {configured && `Each search uses 1 of your ${serpApi.searchesLeft ?? '–'} SerpApi searches left`}
          </span>
        </div>
        {error && (
          <p className="mt-2 rounded bg-amber-50 px-3 py-2 text-sm text-amber-800" role="alert">
            {error.kind === 'not_configured' ? 'SerpApi is not configured — see the card above.' : error.kind === 'quota_exceeded' ? 'SerpApi monthly quota is used up — add stays manually.' : error.message}
          </p>
        )}
      </section>

      {manualOpen && canEdit && (
        <section className={card}>
          <h2 className="font-semibold">Add a stay manually</h2>
          <p className="mb-3 text-xs text-neutral-500">Found something elsewhere (Airbnb, a friend&apos;s flat)? Add it to the shortlist.</p>
          <form action={mAction} className="grid grid-cols-2 gap-3 text-sm sm:grid-cols-4">
            <HiddenIds tripId={tripId} section="stay" optionId="manual" />
            <label className={`${lbl} col-span-2`}>Name<input name="name" placeholder="Hotel or flat name" required className={inp} /></label>
            <label className={`${lbl} col-span-2`}>Address or area<input name="address" className={inp} /></label>
            <label className={lbl}>Dates<input name="checkInOut" placeholder={checkIn && checkOut ? `${checkIn} → ${checkOut}` : 'e.g. Dec 4–7'} className={inp} /></label>
            <label className={lbl}>Total price ({currency})<input name="totalPrice" type="number" step="0.01" min="0" className={inp} /></label>
            <label className={`${lbl} col-span-2`}>Booking link<input name="url" type="url" placeholder="https://" className={inp} /></label>
            <label className={lbl}>Latitude (for the map)<input name="lat" inputMode="decimal" className={inp} /></label>
            <label className={lbl}>Longitude<input name="lon" inputMode="decimal" className={inp} /></label>
            <div className="col-span-2 flex items-end"><SubmitButton className={btn}>Add</SubmitButton></div>
            {mState.error && <p role="alert" className="col-span-full text-sm text-red-600">{mState.error}</p>}
          </form>
        </section>
      )}

      {results !== null && (
        <section className="flex flex-col gap-3">
          <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-sm">
            <p className="font-medium text-neutral-800">
              {visible.length} of {results.length} stays
              {searched && <span className="font-normal text-neutral-500"> · {dayLabel(searched.checkIn)} – {dayLabel(searched.checkOut)}</span>}
            </p>
            <span className="flex flex-wrap items-center gap-2 text-xs text-neutral-600">
              <span className="font-medium">Refine instantly:</span>
              <label className="flex items-center gap-1">near
                <select value={nearKey} onChange={(e) => setNearKey(e.target.value)} className={inp}>
                  {centers.map((c) => <option key={c.key} value={c.key}>{c.label}</option>)}
                  <option value="pin">Dropped pin</option>
                </select>
              </label>
              <label className="flex items-center gap-1">within
                <select value={radiusKm} onChange={(e) => setRadiusKm(Number(e.target.value))} className={inp}>
                  <option value="0">any distance</option><option value="2">2 km</option><option value="5">5 km</option><option value="10">10 km</option>
                </select>
              </label>
              <button type="button" className={`${btn2} inline-flex items-center gap-1`} onClick={() => setShowMap((v) => !v)} aria-pressed={showMap}>
                <MapIcon aria-hidden className="h-3.5 w-3.5" />{showMap ? 'Hide map' : 'Map'}
              </button>
            </span>
          </div>
          <p className="flex items-start gap-1.5 text-xs text-neutral-500">
            <Info aria-hidden className="mt-px h-3.5 w-3.5 shrink-0" />
            Score (0–100) blends price vs. the typical rate, guest rating, number of reviews, and location. Distances are from {nearLabel}. Click a row for details.
          </p>
          {showMap && (
            <div>
              <OptionMap points={mapPoints} onPick={(lat, lon) => { setPin({ lat, lon }); setNearKey('pin'); }} />
              <p className="mt-1 text-xs text-neutral-500">Click the map to drop a pin and measure distances from it.</p>
            </div>
          )}
          {visible.length > 0 && (
            <LodgingTable
              items={visible} canEdit={canEdit} onShortlist={shortlist}
              isShortlisted={(l) => shortlistedKeys.has(keyOf(l))} isPending={(l) => pending.has(keyOf(l))}
              topIds={topIds} nearPoint={nearPoint} sortBy={sortBy} onSort={setSortBy}
            />
          )}
          {visible.length === 0 && <p className="text-sm text-neutral-500">No stays match — widen the distance or filters.</p>}
          {ads.length > 0 && (
            <p className="text-xs text-neutral-400">{plural(ads.length, 'sponsored result')} hidden</p>
          )}
        </section>
      )}

      <ShortlistedOptions tripId={tripId} section="stay" title="Shortlisted stays" canEdit={canEdit} options={options} />
    </div>
  );
}
