'use client';

import { useRouter } from 'next/navigation';
import { useActionState, useEffect, useRef, useState } from 'react';
import {
  manualFlightAction, shortlistFlightAction, startScanAction,
} from '@/lib/actions/flights';
import { ShortlistedOptions } from '@/components/shortlisted-options';
import type { ActionState } from '@/lib/actions/people';
import { passesWindow } from '@/lib/domain/dates/windows';

type Pair = {
  depart: string; back: string | null; status: 'pending' | 'done' | 'error';
  minTotal: number | null; currency: string | null; verified?: 'ok' | 'no_match';
  error?: { kind: string; message: string }; clippedWindow?: boolean;
  sparsePassengerMix?: boolean; isFrom: boolean; count: number;
};
type Search = {
  id: string; status: string; total: number; completed: number;
  result: { pairs?: Pair[] } | null; createdAt: string; error: string | null;
};
type Itin = {
  id: string; outbound: Leg; return?: Leg;
  price: { total: number | null; perPerson: number | null; currency: string; isFrom: boolean };
  bookingUrl: string; isBest: boolean;
};
type Leg = {
  segments: { airlineCode: string; airlineName: string; flightNumber: string; from: { code: string }; to: { code: string }; departLocal: string; arriveLocal: string; aircraft?: string }[];
  layovers: { airportCode: string; airportName?: string; durationMin: number }[];
  from: { code: string }; to: { code: string }; departLocal: string; arriveLocal: string;
  fromTz?: string; toTz?: string;
  durationMin: number; stops: number; airlines: string[];
};
type Opt = {
  id: string; title: string; subtitle: string | null; status: string;
  price: number | null; currency: string | null; bookingUrl: string | null;
  bookingRef: string | null; source: string;
  votes: { score: number; voters: { name: string; value: number }[] };
  comments: { id: string; body: string; author: string }[];
};

const btn = 'rounded-lg bg-teal-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-teal-700 disabled:opacity-50';
const btn2 = 'rounded-md border border-neutral-300 px-2.5 py-1 text-xs text-neutral-700 hover:bg-neutral-100';
const card = 'rounded-xl border border-neutral-200 bg-white p-4 shadow-sm';
const inp = 'rounded-lg border border-neutral-300 px-2 py-1 text-sm';

function fmtMin(min: number) {
  return `${Math.floor(min / 60)}h ${min % 60}m`;
}
function t(local: string) {
  return local.slice(11, 16);
}
function plusOne(local: string, segs: Leg['segments']) {
  // +1 marker when arrival date differs from depart date.
  return local.slice(0, 10) !== segs[0].departLocal.slice(0, 10) ? ' +1' : '';
}

function FlightCard({ it, onShortlist, canEdit, onReturns }: {
  it: Itin; canEdit: boolean; onShortlist: () => void; onReturns?: () => void;
}) {
  const segs = it.outbound.segments;
  return (
    <div className={card}>
      <div className="flex items-center justify-between gap-2">
        <div>
          <p className="font-medium">
            {it.outbound.airlines.join(', ')} ·{' '}
            {segs.map((s) => `${s.airlineCode} ${s.flightNumber}`).join(' · ')}
            {it.isBest && <span className="ml-2 rounded bg-teal-100 px-1.5 text-xs text-teal-700">Best</span>}
          </p>
          <p className="text-sm text-neutral-600">
            {it.outbound.from.code} {t(it.outbound.departLocal)} → {it.outbound.to.code}{' '}
            {t(it.outbound.arriveLocal)}{plusOne(it.outbound.arriveLocal, segs)} · {fmtMin(it.outbound.durationMin)}
            {it.outbound.stops > 0
              ? ` · ${it.outbound.stops} stop${it.outbound.stops > 1 ? 's' : ''} ${it.outbound.layovers.map((l) => `${l.airportCode} ${fmtMin(l.durationMin)}`).join(', ')}`
              : ' · nonstop'}
            {segs.some((s) => s.aircraft) && ` · ${segs.map((s) => s.aircraft).filter(Boolean).join(', ')}`}
          </p>
          {it.return && (
            <p className="text-sm text-neutral-600">
              Back {it.return.from.code} {t(it.return.departLocal)} → {it.return.to.code}{' '}
              {t(it.return.arriveLocal)}{plusOne(it.return.arriveLocal, it.return.segments)}
            </p>
          )}
        </div>
        <div className="text-right">
          <p className="font-semibold">
            {it.price.total !== null ? `${it.price.isFrom ? 'from ' : ''}$${Math.round(it.price.total)}` : 'price unavailable'}
          </p>
          {it.price.perPerson !== null && (
            <p className="text-xs text-neutral-500">${Math.round(it.price.perPerson)} per person</p>
          )}
          <div className="mt-1 flex justify-end gap-1">
            {canEdit && <button type="button" className={btn2} onClick={onShortlist}>Shortlist</button>}
            {onReturns && <button type="button" className={btn2} onClick={onReturns}>See return flights</button>}
            {it.bookingUrl && (
              <a href={it.bookingUrl} target="_blank" rel="noopener noreferrer" className={btn2}>
                Book on Google Flights
              </a>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

export function FlightsClient({
  tripId, canEdit, strategySummary, hasKids, initialSearch, timePrefs, options,
}: {
  tripId: string; canEdit: boolean; strategySummary: string; hasKids: boolean;
  initialSearch: Search | null; timePrefs: { outboundDepart?: { start: string; end: string }; returnDepart?: { start: string; end: string }; timezone?: string };
  options: Opt[];
}) {
  const router = useRouter();
  const [search, setSearch] = useState<Search | null>(initialSearch);
  const [pair, setPair] = useState<Pair | null>(null);
  const [list, setList] = useState<Itin[] | null>(null);
  const [listErr, setListErr] = useState<string | null>(null);
  const [returns, setReturns] = useState<Itin[] | null>(null);
  const [filterStops, setFilterStops] = useState<number | 'any'>('any');
  const [airlines, setAirlines] = useState<Set<string>>(new Set());
  const [maxDur, setMaxDur] = useState(0);
  const [sortBy, setSortBy] = useState<'price' | 'duration' | 'departure'>('price');
  const [adultsOnly, setAdultsOnly] = useState(false);
  const [showAllReturns, setShowAllReturns] = useState(false);
  const [manualOpen, setManualOpen] = useState(false);
  const [mState, mAction] = useActionState<ActionState, FormData>(manualFlightAction, {});
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const [stale, setStale] = useState(false);

  const [seenSearchId, setSeenSearchId] = useState(initialSearch?.id);
  if (initialSearch?.id !== seenSearchId) {
    setSeenSearchId(initialSearch?.id);
    setSearch(initialSearch);
  }
  const running = search && (search.status === 'queued' || search.status === 'running');

  useEffect(() => {
    if (!running || !search) return;
    const started = Date.now();
    pollRef.current = setInterval(async () => {
      const res = await fetch(`/api/flight-searches/${search.id}`);
      if (res.ok) {
        const data = (await res.json()) as Search;
        setSearch(data);
        if (data.status !== 'queued' && data.status !== 'running') router.refresh();
      }
      if (Date.now() - started > 5 * 60 * 1000 && (search.completed === 0)) setStale(true);
    }, 1500);
    return () => { if (pollRef.current) clearInterval(pollRef.current); };
  }, [running, search, router]);

  async function openPair(p: Pair) {
    setPair(p); setList(null); setReturns(null); setListErr(null);
    const res = await fetch(`/api/trips/${tripId}/flights?depart=${p.depart}${p.back ? `&return=${p.back}` : ''}`);
    const data = await res.json();
    if (!res.ok) { setListErr(data.error?.message ?? 'Failed to load flights'); return; }
    setList(data.itineraries);
    setAirlines(new Set());
  }

  async function openReturns(it: Itin) {
    setReturns(null);
    const res = await fetch(`/api/trips/${tripId}/flights/returns?depart=${pair!.depart}&return=${pair!.back}&outbound=${it.id}`);
    const data = await res.json();
    if (!res.ok) { setListErr(data.error?.message ?? 'Failed to load returns'); return; }
    setReturns(data.itineraries);
  }

  async function shortlist(it: Itin) {
    const fd = new FormData();
    fd.set('tripId', tripId);
    fd.set('itinerary', JSON.stringify(it));
    await shortlistFlightAction(fd);
    router.refresh();
  }

  const pairs = search?.result?.pairs ?? [];
  const prices = pairs.filter((p) => p.minTotal !== null).map((p) => p.minTotal!);
  const lo = Math.min(...prices), hi = Math.max(...prices);
  const cheapest3 = [...pairs].filter((p) => p.minTotal !== null).sort((a, b) => a.minTotal! - b.minTotal!).slice(0, 3);

  const visible = (list ?? []).filter((it) =>
    (filterStops === 'any' || it.outbound.stops <= filterStops) &&
    (airlines.size === 0 || it.outbound.airlines.some((a) => airlines.has(a))) &&
    (maxDur === 0 || it.outbound.durationMin <= maxDur),
  ).sort((a, b) =>
    sortBy === 'price' ? (a.price.total ?? 1e15) - (b.price.total ?? 1e15)
    : sortBy === 'duration' ? a.outbound.durationMin - b.outbound.durationMin
    : a.outbound.departLocal.localeCompare(b.outbound.departLocal));
  const allAirlines = [...new Set((list ?? []).flatMap((i) => i.outbound.airlines))];

  const scanFailed = search && (search.status === 'failed' || pairs.some((p) => p.error && (p.error.kind === 'blocked' || p.error.kind === 'parse')));

  const returnInWindow = (it: Itin) =>
    !timePrefs.returnDepart || !it.return || !pair?.back ||
    passesWindow(
      it.return.departLocal, it.return.fromTz ?? 'UTC',
      timePrefs.returnDepart, timePrefs.timezone ?? 'UTC', pair.back,
    );
  const visibleReturns = (returns ?? []).filter((it) => showAllReturns || returnInWindow(it));

  return (
    <div className="flex flex-col gap-6">
      <section className={card}>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-sm text-neutral-600">{strategySummary}</p>
            {(timePrefs.outboundDepart || timePrefs.returnDepart) && (
              <p className="text-xs text-amber-700">
                Time windows apply. Departures after midnight airport time fall on the next day and aren&apos;t included.
              </p>
            )}
          </div>
          {canEdit && (
            <div className="flex items-center gap-3">
              {hasKids && (
                <label className="flex items-center gap-1.5 text-xs text-neutral-600">
                  <input type="checkbox" checked={adultsOnly} onChange={(e) => setAdultsOnly(e.target.checked)} className="accent-teal-600" />
                  Price as adults only
                </label>
              )}
              <form onSubmit={async (e) => { e.preventDefault(); const fd = new FormData(e.currentTarget); await startScanAction(fd); router.refresh(); }}>
                <input type="hidden" name="tripId" value={tripId} />
                <input type="hidden" name="adultsOnly" value={adultsOnly ? '1' : '0'} />
                <button type="submit" className={btn}>Search flights</button>
              </form>
              <button type="button" className={btn2} onClick={() => setManualOpen((v) => !v)}>Add manually</button>
            </div>
          )}
        </div>
        {running && (
          <p className="mt-2 text-sm" role="status">
            {search!.completed} / {search!.total} dates checked
            <span className="ml-2 inline-block h-2 w-40 overflow-hidden rounded bg-neutral-200 align-middle">
              <span className="block h-full bg-teal-500" style={{ width: `${(search!.completed / Math.max(1, search!.total)) * 100}%` }} />
            </span>
          </p>
        )}
        {search?.status === 'failed' && <p className="mt-2 text-sm text-red-600">Scan failed ({search.error}). Try Search flights again.</p>}
        {scanFailed && <p className="mt-2 rounded bg-amber-50 px-3 py-2 text-sm text-amber-800">Google Flights reading is temporarily failing; you can still add flights manually.</p>}
        {stale && <p className="mt-2 text-sm text-amber-700">This scan looks stalled — try Search flights again.</p>}
      </section>

      {manualOpen && canEdit && (
        <section className={card}>
          <h2 className="mb-2 font-semibold">Manual flight entry</h2>
          <form action={mAction} className="flex flex-wrap items-end gap-2 text-sm">
            <input type="hidden" name="tripId" value={tripId} />
            <input name="airlineCode" placeholder="Airline (DL)" required maxLength={3} className={`${inp} w-20`} />
            <input name="flightNumber" placeholder="Flight #" required className={`${inp} w-20`} />
            <input name="from" placeholder="JFK" required maxLength={3} className={`${inp} w-20`} />
            <input name="to" placeholder="LIS" required maxLength={3} className={`${inp} w-20`} />
            <input name="departLocal" placeholder="2026-12-04T20:15" required className={`${inp} w-40`} />
            <input name="arriveLocal" placeholder="2026-12-05T08:00" required className={`${inp} w-40`} />
            <input name="returnDepartLocal" placeholder="Return departs (opt.)" className={`${inp} w-40`} />
            <input name="returnArriveLocal" placeholder="Return arrives (opt.)" className={`${inp} w-40`} />
            <input name="price" placeholder="Price" type="number" step="0.01" className={`${inp} w-24`} />
            <input name="currency" placeholder="USD" defaultValue="USD" maxLength={3} className={`${inp} w-16`} />
            <input name="bookingRef" placeholder="Conf. #" className={`${inp} w-24`} />
            <button type="submit" className={btn}>Add</button>
            {mState.error && <p role="alert" className="text-sm text-red-600">{mState.error}</p>}
          </form>
        </section>
      )}

      {pairs.length > 0 && (
        <section className={card}>
          <h2 className="mb-2 font-semibold">Date prices</h2>
          <div className="grid grid-cols-4 gap-2 sm:grid-cols-6">
            {pairs.map((p) => {
              const top = cheapest3.includes(p);
              const color = p.minTotal === null
                ? 'bg-neutral-50 text-neutral-400'
                : `text-neutral-900 ${p.minTotal === lo ? 'bg-teal-200' : p.minTotal === hi ? 'bg-red-100' : 'bg-teal-50'}`;
              return (
                <button
                  key={`${p.depart}|${p.back}`}
                  type="button"
                  onClick={() => openPair(p)}
                  className={`rounded-lg border border-neutral-200 px-2 py-2 text-left text-xs hover:border-teal-500 ${color}`}
                >
                  <span className="block font-medium">{p.depart.slice(5)} → {p.back ? p.back.slice(5) : 'one-way'}</span>
                  <span className="block">
                    {p.status === 'pending' && '…'}
                    {p.status === 'error' && 'error — retry'}
                    {p.status === 'done' && (p.minTotal !== null ? `$${Math.round(p.minTotal)}` : p.verified === 'no_match' ? 'no flights match your return time' : 'n/a')}
                    {top && ' · cheapest'}
                  </span>
                </button>
              );
            })}
          </div>
        </section>
      )}

      {pair && (
        <section className={card}>
          <div className="mb-3 flex flex-wrap items-center gap-3">
            <h2 className="font-semibold">{pair.depart} → {pair.back ?? 'one-way'}</h2>
            <label className="text-xs">Stops
              <select className={`${inp} ml-1`} value={filterStops} onChange={(e) => setFilterStops(e.target.value === 'any' ? 'any' : Number(e.target.value))}>
                <option value="any">any</option><option value="0">nonstop</option><option value="1">≤1</option><option value="2">≤2</option>
              </select>
            </label>
            <label className="text-xs">Max duration
              <select className={`${inp} ml-1`} value={maxDur} onChange={(e) => setMaxDur(Number(e.target.value))}>
                <option value="0">any</option><option value="480">8h</option><option value="720">12h</option><option value="960">16h</option>
              </select>
            </label>
            <label className="text-xs">Sort
              <select className={`${inp} ml-1`} value={sortBy} onChange={(e) => setSortBy(e.target.value as never)}>
                <option value="price">price</option><option value="duration">duration</option><option value="departure">departure</option>
              </select>
            </label>
            {allAirlines.length > 1 && (
              <span className="flex gap-2 text-xs">
                {allAirlines.map((a) => (
                  <label key={a} className="flex items-center gap-1">
                    <input type="checkbox" checked={airlines.has(a)} onChange={() => setAirlines((s) => { const n = new Set(s); if (n.has(a)) n.delete(a); else n.add(a); return n; })} className="accent-teal-600" />
                    {a}
                  </label>
                ))}
              </span>
            )}
          </div>
          {listErr && <p role="alert" className="text-sm text-red-600">{listErr}</p>}
          {!list && !listErr && <p className="text-sm text-neutral-500">Loading…</p>}
          <div className="flex flex-col gap-3">
            {visible.map((it) => (
              <FlightCard key={it.id} it={it} canEdit={canEdit} onShortlist={() => shortlist(it)}
                onReturns={pair.back ? () => openReturns(it) : undefined} />
            ))}
            {list && visible.length === 0 && <p className="text-sm text-neutral-500">No flights match the filters.</p>}
          </div>
          {pair.back && (
            <div className="mt-4">
              {timePrefs.returnDepart && (
                <label className="mb-2 flex items-center gap-1.5 text-xs text-neutral-600">
                  <input type="checkbox" checked={showAllReturns} onChange={(e) => setShowAllReturns(e.target.checked)} className="accent-teal-600" />
                  Show returns outside your time window
                </label>
              )}
              <div className="flex flex-col gap-3">
                {visibleReturns.map((it) => (
                  <FlightCard key={it.id} it={it} canEdit={canEdit} onShortlist={() => shortlist(it)} />
                ))}
                {returns && visibleReturns.length === 0 && (
                  <p className="text-sm text-neutral-500">No return flights inside your time window — check the box above to see all.</p>
                )}
              </div>
            </div>
          )}
        </section>
      )}

      <ShortlistedOptions tripId={tripId} section="flights" title="Shortlisted flights" canEdit={canEdit} options={options} />
    </div>
  );
}
