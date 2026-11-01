'use client';

import { useRouter } from 'next/navigation';
import { useActionState, useMemo, useState } from 'react';
import { shortlistOptionAction } from '@/lib/actions/options';
import type { ActionState } from '@/lib/actions/people';
import { haversineKm, kmLabel, type GeoPoint } from '@/lib/domain/geo';
import { scoreLodgings, type Scored } from '@/lib/domain/stay';
import type { LodgingResult } from '@/lib/providers/types';
import { AMENITY_IDS, NON_HOSTEL_TYPE_IDS, PROPERTY_TYPES, HOTEL_RATING } from '@/lib/providers/serpapi/hotel-filters';
import { OptionMap, type MapPoint } from '@/components/option-map';
import { HiddenIds, ShortlistedOptions, ui, type ShortlistedOption } from '@/components/shortlisted-options';

const { btn, btn2, card, inp } = ui;

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

type StaySort = 'score' | 'price' | 'rating';

/** Compact comparison table; click a row to expand details. */
function LodgingTable({ items, canEdit, onShortlist, nearPoint, sortBy, onSort }: {
  items: Scored<LodgingResult>[]; canEdit: boolean; onShortlist: (l: LodgingResult) => void;
  nearPoint: GeoPoint | null; sortBy: StaySort; onSort: (k: StaySort) => void;
}) {
  const [open, setOpen] = useState<string | null>(null);
  const th = (label: string, k?: StaySort, right = false) => (
    <th className={`whitespace-nowrap px-3 py-2 font-medium ${right ? 'text-right' : 'text-left'}`}>
      {k ? (
        <button type="button" onClick={() => onSort(k)} className="hover:text-teal-700">
          {label}{sortBy === k && (k === 'score' || k === 'rating' ? ' ↓' : ' ↑')}
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
            {nearPoint && th('Dist', undefined, true)}<th aria-label="actions" />
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
                  <span className="flex items-center gap-2">
                    {l.images[0] && (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={l.images[0]} alt="" className="h-10 w-14 shrink-0 rounded object-cover" />
                    )}
                    <span>
                      <span className="font-medium">{l.name}</span>
                      {l.score >= 75 && <span className="ml-1.5 rounded bg-teal-100 px-1 text-xs text-teal-700">Recommended</span>}
                      <span className="block text-xs text-neutral-500">
                        {l.hotelClass ? `${'★'.repeat(l.hotelClass)} ` : ''}
                        {l.isHostel ? 'hostel' : l.kind === 'vacation_rental' ? 'rental' : 'hotel'}
                      </span>
                    </span>
                  </span>
                </td>
                <td className="whitespace-nowrap px-3 py-2">
                  {l.rating !== undefined
                    ? <><span className="font-medium">{l.rating}</span>
                        <span className="block text-xs text-neutral-500">{l.reviews?.toLocaleString() ?? 0} reviews</span></>
                    : <span className="text-neutral-400">unrated</span>}
                </td>
                <td className="whitespace-nowrap px-3 py-2 text-right">
                  <span className={`rounded px-1.5 py-0.5 text-xs font-medium ${l.score >= 75 ? 'bg-teal-100 text-teal-800' : 'bg-neutral-100 text-neutral-600'}`}>{l.score}</span>
                </td>
                <td className="whitespace-nowrap px-3 py-2 text-right">
                  {l.pricePerNight !== undefined
                    ? <><span className="font-semibold">{l.currency} {Math.round(l.pricePerNight)}</span><span className="text-xs text-neutral-500">/night</span></>
                    : <span className="text-xs text-neutral-400">no price</span>}
                  {l.totalPrice !== undefined && <span className="block text-xs text-neutral-500">{l.currency} {Math.round(l.totalPrice)} total</span>}
                </td>
                {nearPoint && <td className="whitespace-nowrap px-3 py-2 text-right text-xs text-neutral-600">{dist !== undefined ? kmLabel(dist) : '—'}</td>}
                <td className="px-3 py-2">
                  <span className="flex flex-col items-end gap-1" onClick={(e) => e.stopPropagation()}>
                    {canEdit && <button type="button" className={btn2} onClick={() => onShortlist(l)}>Shortlist</button>}
                    {l.link && <a href={l.link} target="_blank" rel="noopener noreferrer" className={btn2}>Site</a>}
                  </span>
                </td>
              </tr>,
              open === l.id && (
                <tr key={`${l.id}-detail`} className="border-b border-neutral-200 bg-neutral-50">
                  <td colSpan={nearPoint ? 6 : 5} className="px-3 py-2 text-xs text-neutral-600">
                    {l.description && <p>{l.description}</p>}
                    {l.reasons.length > 0 && <p className="mt-0.5 text-teal-700">{l.reasons.join(' · ')}</p>}
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
  const [kind, setKind] = useState<'any' | 'no_hostels' | 'hostels' | 'vacation'>('any');
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

  async function search() {
    setLoading(true); setError(null); setResults(null); setAds([]);
    const p = new URLSearchParams({ check_in: checkIn, check_out: checkOut });
    if (area.trim()) p.set('area', area.trim());
    if (kind === 'no_hostels') p.set('property_types', NON_HOSTEL_TYPE_IDS.join(','));
    if (kind === 'hostels') p.set('property_types', String(PROPERTY_TYPES.hostel));
    if (kind === 'vacation') p.set('vacation_rentals', '1');
    if (minPrice) p.set('min_price', minPrice);
    if (maxPrice) p.set('max_price', maxPrice);
    if (minRating !== '0') p.set('rating', String(HOTEL_RATING[minRating as keyof typeof HOTEL_RATING] ?? ''));
    if (classes.size) p.set('hotel_class', [...classes].sort().join(','));
    if (amenities.size) p.set('amenities', [...amenities].join(','));
    if (freeCancel) p.set('free_cancellation', '1');
    try {
      const res = await fetch(`/api/trips/${tripId}/stay?${p}`);
      const data = await res.json();
      if (!res.ok) { setError(data.error ?? { kind: 'error', message: 'Search failed' }); return; }
      setResults(scoreLodgings(data.lodgings ?? []));
      setAds(data.ads ?? []);
    } catch {
      setError({ kind: 'network', message: 'Request failed' });
    } finally {
      setLoading(false);
    }
  }

  async function shortlist(l: LodgingResult) {
    const fd = new FormData();
    fd.set('tripId', tripId); fd.set('section', 'stay');
    fd.set('kind', 'lodging'); fd.set('source', 'serpapi_google_hotels');
    fd.set('externalId', `${l.id}:${checkIn}:${checkOut}`);
    fd.set('title', l.name);
    fd.set('subtitle', [
      l.hotelClass ? `${l.hotelClass}★` : null,
      l.rating !== undefined ? `${l.rating} (${l.reviews ?? 0})` : null,
      l.pricePerNight !== undefined ? `${l.currency} ${Math.round(l.pricePerNight)}/night` : null,
    ].filter(Boolean).join(' · '));
    fd.set('data', JSON.stringify({ ...l, checkIn, checkOut }));
    if (l.totalPrice !== undefined) { fd.set('priceAmount', String(l.totalPrice)); fd.set('priceCurrency', l.currency ?? currency); }
    if (l.lat !== undefined) fd.set('lat', String(l.lat));
    if (l.lon !== undefined) fd.set('lon', String(l.lon));
    if (l.link) fd.set('bookingUrl', l.link);
    const r = await shortlistOptionAction(fd);
    if (r?.error) setError({ kind: 'input', message: r.error });
    router.refresh();
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

  const mapPoints: MapPoint[] = visible
    .filter((l) => l.lat !== undefined && l.lon !== undefined)
    .map((l) => ({ id: l.id, lat: l.lat!, lon: l.lon!, title: l.name, subtitle: l.pricePerNight !== undefined ? `${l.currency} ${Math.round(l.pricePerNight)}/night · score ${l.score}` : `score ${l.score}`, tone: l.score >= 75 ? 'top' as const : 'default' as const }));
  if (nearPoint) mapPoints.unshift({ id: '__center', lat: nearPoint.lat, lon: nearPoint.lon, title: 'Search centre', tone: 'center' });
  if (pin) mapPoints.unshift({ id: '__pin', lat: pin.lat, lon: pin.lon, title: 'Dropped pin', tone: 'pin' });

  const configured = serpApi.status === 'ok';
  const nights = checkIn && checkOut ? Math.max(0, Math.round((Date.parse(checkOut) - Date.parse(checkIn)) / 86400000)) : 0;

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
        <div className="flex flex-wrap items-end gap-2 text-sm">
          <label>Check-in<input type="date" value={checkIn} onChange={(e) => setCheckIn(e.target.value)} className={`${inp} ml-1`} /></label>
          <label>Check-out<input type="date" value={checkOut} onChange={(e) => setCheckOut(e.target.value)} className={`${inp} ml-1`} /></label>
          {nights > 0 && <span className="text-xs text-neutral-500">{nights} night{nights === 1 ? '' : 's'}{dates ? ` · from ${dates.source}` : ''}</span>}
          <label>Area<input value={area} onChange={(e) => setArea(e.target.value)} placeholder="neighbourhood (opt.)" className={`${inp} ml-1 w-40`} /></label>
          <label>Stay type
            <select value={kind} onChange={(e) => setKind(e.target.value as never)} className={`${inp} ml-1`}>
              <option value="any">Any</option><option value="no_hostels">No hostels</option>
              <option value="hostels">Hostels only</option><option value="vacation">Vacation rentals</option>
            </select>
          </label>
          <label>{currency}/night<input value={minPrice} onChange={(e) => setMinPrice(e.target.value.replace(/\D/g, ''))} placeholder="min" className={`${inp} ml-1 w-16`} /></label>
          <label>–<input value={maxPrice} onChange={(e) => setMaxPrice(e.target.value.replace(/\D/g, ''))} placeholder="max" className={`${inp} ml-1 w-16`} /></label>
          <label>Min rating
            <select value={minRating} onChange={(e) => setMinRating(e.target.value)} className={`${inp} ml-1`}>
              <option value="0">any</option><option value="3.5+">3.5+</option><option value="4.0+">4.0+</option><option value="4.5+">4.5+</option>
            </select>
          </label>
          <label className="flex items-center gap-1 text-xs">
            <input type="checkbox" checked={freeCancel} onChange={(e) => setFreeCancel(e.target.checked)} className="accent-teal-600" />Free cancellation
          </label>
        </div>
        <div className="mt-2 flex flex-wrap items-center gap-3 text-xs text-neutral-600">
          <span>Class:</span>
          {[2, 3, 4, 5].map((c) => (
            <label key={c} className="flex items-center gap-1">
              <input type="checkbox" checked={classes.has(c)} onChange={() => setClasses((s) => { const n = new Set(s); if (n.has(c)) n.delete(c); else n.add(c); return n; })} className="accent-teal-600" />{c}★
            </label>
          ))}
          <span className="ml-2">Amenities:</span>
          {AMENITY_CHOICES.map(([label, id]) => (
            <label key={id} className="flex items-center gap-1">
              <input type="checkbox" checked={amenities.has(id)} onChange={() => setAmenities((s) => { const n = new Set(s); if (n.has(id)) n.delete(id); else n.add(id); return n; })} className="accent-teal-600" />{label}
            </label>
          ))}
        </div>
        <div className="mt-3 flex flex-wrap items-center gap-3">
          <label className="text-xs">Near
            <select value={nearKey} onChange={(e) => setNearKey(e.target.value)} className={`${inp} ml-1`}>
              {centers.map((c) => <option key={c.key} value={c.key}>{c.label}</option>)}
              <option value="pin">Dropped pin</option>
            </select>
          </label>
          <label className="text-xs">Within
            <select value={radiusKm} onChange={(e) => setRadiusKm(Number(e.target.value))} className={`${inp} ml-1`}>
              <option value="0">any distance</option><option value="2">2 km</option><option value="5">5 km</option><option value="10">10 km</option>
            </select>
          </label>
          <button type="button" className={btn2} onClick={() => setShowMap((v) => !v)}>{showMap ? 'Hide map' : 'Map'}</button>
          <span className="flex-1" />
          {configured && <span className="text-xs text-neutral-500">{serpApi.searchesLeft ?? '–'} SerpApi searches left</span>}
          <button type="button" disabled={!configured || loading || !checkIn || !checkOut || checkOut <= checkIn} className={btn} onClick={search}>
            {loading ? 'Searching…' : 'Search stays'}
          </button>
          {canEdit && <button type="button" className={btn2} onClick={() => setManualOpen((v) => !v)}>Add manually</button>}
        </div>
        {error && (
          <p className="mt-2 rounded bg-amber-50 px-3 py-2 text-sm text-amber-800" role="alert">
            {error.kind === 'not_configured' ? 'SerpApi is not configured — see the card above.' : error.kind === 'quota_exceeded' ? 'SerpApi monthly quota is used up — add stays manually.' : error.message}
          </p>
        )}
        {showMap && (
          <div className="mt-3">
            <OptionMap points={mapPoints} onPick={(lat, lon) => { setPin({ lat, lon }); setNearKey('pin'); }} />
            <p className="mt-1 text-xs text-neutral-500">Click the map to drop a pin and search near it.</p>
          </div>
        )}
      </section>

      {manualOpen && canEdit && (
        <section className={card}>
          <h2 className="mb-2 font-semibold">Manual stay entry</h2>
          <form action={mAction} className="flex flex-wrap items-end gap-2 text-sm">
            <HiddenIds tripId={tripId} section="stay" optionId="manual" />
            <input name="name" placeholder="Hotel or flat name" required className={`${inp} w-56`} />
            <input name="address" placeholder="Address / area" className={`${inp} w-48`} />
            <input name="checkInOut" placeholder={`${checkIn} → ${checkOut}`} className={`${inp} w-48`} />
            <input name="totalPrice" placeholder="Total price" type="number" step="0.01" className={`${inp} w-24`} />
            <input name="url" placeholder="Booking URL" className={`${inp} w-44`} />
            <input name="lat" placeholder="lat" className={`${inp} w-24`} />
            <input name="lon" placeholder="lon" className={`${inp} w-24`} />
            <button type="submit" className={btn}>Add</button>
            {mState.error && <p role="alert" className="text-sm text-red-600">{mState.error}</p>}
          </form>
        </section>
      )}

      {results !== null && (
        <section className="flex flex-col gap-3">
          <p className="text-sm text-neutral-600">
            {visible.length} of {results.length} stay{results.length === 1 ? '' : 's'}
            {radiusKm > 0 && nearPoint ? ` within ${radiusKm} km` : ''}
          </p>
          {visible.length > 0 && (
            <LodgingTable items={visible} canEdit={canEdit} onShortlist={shortlist}
              nearPoint={nearPoint} sortBy={sortBy} onSort={setSortBy} />
          )}
          {visible.length === 0 && <p className="text-sm text-neutral-500">No stays match — widen the radius or filters.</p>}
          {ads.length > 0 && (
            <p className="mt-2 text-xs text-neutral-400">{ads.length} sponsored result{ads.length === 1 ? '' : 's'} hidden</p>
          )}
        </section>
      )}

      <ShortlistedOptions tripId={tripId} section="stay" title="Shortlisted stays" canEdit={canEdit} options={options} />
    </div>
  );
}
