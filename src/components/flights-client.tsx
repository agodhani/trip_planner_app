'use client';

import { useRouter } from 'next/navigation';
import { useActionState, useEffect, useEffectEvent, useRef, useState } from 'react';
import { ArrowLeft, Check, Clock, ExternalLink, Loader2 } from 'lucide-react';
import {
  manualFlightAction, shortlistFlightAction, startScanAction,
} from '@/lib/actions/flights';
import { ShortlistedOptions, type ShortlistedOption } from '@/components/shortlisted-options';
import { SubmitButton } from '@/components/submit-button';
import type { ActionState } from '@/lib/actions/people';
import { passesWindow } from '@/lib/domain/dates/windows';
import {
  emissionsInfo, flightKey, fmtMin, hhmm as t, isWellFormedItin, layoverFlags, legroomLabel, plusOne,
} from '@/lib/domain/flight-rows';
import { dayLabel, money, nightsBetween, plural, shortDate, weekday } from '@/lib/ui-format';

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
  segments: { airlineCode: string; airlineName: string; flightNumber: string; from: { code: string }; to: { code: string }; departLocal: string; arriveLocal: string; aircraft?: string; legroom?: string }[];
  layovers: { airportCode: string; airportName?: string; cityName?: string; departAirportCode?: string; durationMin: number; overnight?: boolean }[];
  from: { code: string }; to: { code: string }; departLocal: string; arriveLocal: string;
  fromTz?: string; toTz?: string;
  durationMin: number; stops: number; airlines: string[];
  emissionsKg?: number; typicalEmissionsKg?: number;
};

const btn = 'rounded-lg bg-teal-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-teal-700 disabled:opacity-50';
const btn2 = 'inline-flex items-center gap-1 rounded-md border border-neutral-300 px-2.5 py-1 text-xs text-neutral-700 hover:bg-neutral-100 disabled:opacity-50';
const btnSm = 'rounded-md bg-teal-600 px-2.5 py-1 text-xs font-medium text-white hover:bg-teal-700';
const card = 'rounded-xl border border-neutral-200 bg-white p-4 shadow-sm';
const inp = 'rounded-lg border border-neutral-300 px-2 py-1 text-sm';
const lbl = 'flex flex-col gap-1 text-xs font-medium text-neutral-600';

type SortKey = 'price' | 'duration' | 'departure' | 'emissions';
type Mode = 'outbound' | 'return' | 'oneway';

const airlineNames = (leg: Leg) =>
  [...new Set(leg.segments.map((s) => s.airlineName || s.airlineCode))].join(', ');
const stopsText = (leg: Leg) => (leg.stops === 0 ? 'Nonstop' : plural(leg.stops, 'stop'));

function LegDetail({ leg, label }: { leg: Leg; label: string }) {
  const em = emissionsInfo(leg);
  return (
    <div className="mb-2 last:mb-0">
      <p className="font-medium text-neutral-700">{label} · {dayLabel(leg.departLocal)}</p>
      {leg.segments.map((s, i) => {
        const legroom = legroomLabel(s.legroom);
        const lay = leg.layovers[i];
        return (
          <div key={i}>
            <p>
              {t(s.departLocal)} {s.from.code} → {t(s.arriveLocal)} {s.to.code} · {s.airlineName} {s.airlineCode} {s.flightNumber}
              {s.aircraft && ` · ${s.aircraft}`}
              {legroom && ` · ${legroom}`}
            </p>
            {lay && (
              <p className="pl-3 text-neutral-500">
                Layover in {lay.cityName ?? lay.airportName ?? lay.airportCode}
                {lay.cityName && (lay.airportName ? ` · ${lay.airportName} (${lay.airportCode})` : ` · ${lay.airportCode}`)}
                {' · '}{fmtMin(lay.durationMin)}
                {layoverFlags(lay).map((f) => (
                  <span key={f.kind} className="text-amber-700"> · {f.label}</span>
                ))}
              </p>
            )}
          </div>
        );
      })}
      {em && (
        <p className="text-neutral-500">
          Emissions: {em.kg} kg CO₂e
          {em.vsTypical && ` · ${em.vsTypical} (${leg.typicalEmissionsKg} kg)`}
        </p>
      )}
    </div>
  );
}

/** Kayak-style comparison table; click a row to expand segment details. */
function FlightTable({
  items, mode, canEdit, travelers, isShortlisted, isPending, onShortlist, onChooseReturn, sortBy, onSort, testId,
}: {
  items: Itin[]; mode: Mode; canEdit: boolean; travelers: number;
  isShortlisted: (key: string) => boolean; isPending: (key: string) => boolean;
  onShortlist: (it: Itin) => void; onChooseReturn?: (it: Itin) => void;
  sortBy: SortKey; onSort: (k: SortKey) => void; testId: string;
}) {
  const [open, setOpen] = useState<string | null>(null);
  const th = (label: string, k?: SortKey, right = false) => (
    <th className={`whitespace-nowrap px-3 py-2 font-medium ${right ? 'text-right' : 'text-left'}`}>
      {k ? (
        <button type="button" onClick={() => onSort(k)} className={`hover:text-teal-700 ${sortBy === k ? 'text-teal-700' : ''}`}>
          {label}{sortBy === k && ' ↑'}
        </button>
      ) : label}
    </th>
  );
  return (
    <div className="overflow-x-auto" data-testid={testId}>
      <p className="mb-2 text-xs text-neutral-500">
        Emissions are Google&apos;s per-passenger CO₂e estimate compared with a typical flight on this route.
        Click a row for legroom, aircraft and layover details.
      </p>
      <table className="w-full border-collapse text-sm">
        <thead>
          <tr className="border-b border-neutral-200 text-xs uppercase tracking-wide text-neutral-500">
            {th('Airline')}{th('Departs → Arrives', 'departure')}{th('Duration', 'duration')}{th('Stops')}
            {th('Emissions', 'emissions')}
            {th(mode === 'outbound' ? 'Round trip from' : mode === 'return' ? 'Round trip' : 'Price', 'price', true)}
            <th><span className="sr-only">Actions</span></th>
          </tr>
        </thead>
        <tbody>
          {items.map((it) => {
            const leg = mode === 'return' && it.return ? it.return : it.outbound;
            const key = flightKey(it);
            const saved = isShortlisted(key);
            return [
              <tr
                key={it.id}
                onClick={() => setOpen(open === it.id ? null : it.id)}
                className="cursor-pointer border-b border-neutral-100 align-top hover:bg-teal-50/50"
              >
                <td className="px-3 py-2.5">
                  <span className="font-medium">{airlineNames(leg)}</span>
                  {it.isBest && <span className="ml-1.5 rounded bg-teal-100 px-1 text-xs text-teal-700">Best</span>}
                  <span className="block text-xs text-neutral-500">
                    {leg.segments.map((s) => `${s.airlineCode} ${s.flightNumber}`).join(' · ')}
                  </span>
                </td>
                <td className="whitespace-nowrap px-3 py-2.5">
                  <span className="font-medium">
                    {t(leg.departLocal)} → {t(leg.arriveLocal)}
                    {plusOne(leg.arriveLocal, leg.segments) && (
                      <sup className="ml-0.5 text-xs text-amber-700" title="Arrives the next day">+1</sup>
                    )}
                  </span>
                  <span className="block text-xs text-neutral-500">{leg.from.code} → {leg.to.code}</span>
                </td>
                <td className="whitespace-nowrap px-3 py-2.5">{fmtMin(leg.durationMin)}</td>
                <td className="px-3 py-2.5 text-xs">
                  <span className={leg.stops === 0 ? 'font-medium text-teal-700' : 'text-neutral-700'}>{stopsText(leg)}</span>
                  {leg.stops > 0 && (
                    <span className="block text-neutral-500">
                      {leg.layovers.map((l, i) => (
                        <span key={i} className="block">
                          <span className="whitespace-nowrap">{l.airportCode} {fmtMin(l.durationMin)}</span>
                          {layoverFlags(l).map((f) => (
                            <span key={f.kind} className="block text-amber-700">{f.label}</span>
                          ))}
                        </span>
                      ))}
                    </span>
                  )}
                </td>
                <td className="whitespace-nowrap px-3 py-2.5">
                  {(() => {
                    const em = emissionsInfo(leg);
                    if (!em) return <span className="text-neutral-400">—</span>;
                    return (
                      <>
                        <span className="font-medium">{em.kg} kg</span>
                        {em.vsTypical && (
                          <span className={`block text-xs ${em.pct !== null && em.pct < 0 ? 'text-teal-700' : 'text-neutral-500'}`}>
                            {em.vsTypical}
                          </span>
                        )}
                      </>
                    );
                  })()}
                </td>
                <td className="whitespace-nowrap px-3 py-2.5 text-right">
                  <span className="text-base font-semibold">{money(it.price.total, it.price.currency)}</span>
                  {travelers > 1 && it.price.perPerson !== null && (
                    <span className="block text-xs text-neutral-500">{money(it.price.perPerson, it.price.currency)} / person</span>
                  )}
                </td>
                <td className="px-3 py-2.5">
                  <span className="flex items-center justify-end gap-1.5 whitespace-nowrap" onClick={(e) => e.stopPropagation()}>
                    {onChooseReturn && (
                      <button type="button" className={btnSm} onClick={() => onChooseReturn(it)}>Select this outbound</button>
                    )}
                    {canEdit && (saved ? (
                      <span className="inline-flex items-center gap-1 rounded-md bg-teal-50 px-2 py-1 text-xs font-medium text-teal-700">
                        <Check aria-hidden className="h-3.5 w-3.5" /> Shortlisted
                      </span>
                    ) : (
                      <button type="button" className={btn2} disabled={isPending(key)} onClick={() => onShortlist(it)}>
                        {isPending(key) && <Loader2 aria-hidden className="h-3 w-3 animate-spin" />}{mode === 'return' ? 'Shortlist this round trip' : 'Shortlist'}
                      </button>
                    ))}
                    {it.bookingUrl && (
                      <a href={it.bookingUrl} target="_blank" rel="noopener noreferrer" className={btn2} title="Open on Google Flights">
                        Book <ExternalLink aria-hidden className="h-3 w-3" />
                      </a>
                    )}
                  </span>
                </td>
              </tr>,
              open === it.id && (
                <tr key={`${it.id}-detail`} className="border-b border-neutral-200 bg-neutral-50">
                  <td colSpan={7} className="px-3 py-2 text-xs text-neutral-600">
                    <LegDetail leg={it.outbound} label="Outbound" />
                    {it.return && <LegDetail leg={it.return} label="Return" />}
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

export function FlightsClient({
  tripId, canEdit, strategySummary, hasKids, travelers, initialSearch, timePrefs, options,
}: {
  tripId: string; canEdit: boolean; strategySummary: string; hasKids: boolean; travelers: number;
  initialSearch: Search | null; timePrefs: { outboundDepart?: { start: string; end: string }; returnDepart?: { start: string; end: string }; timezone?: string };
  options: ShortlistedOption[];
}) {
  const router = useRouter();
  const [search, setSearch] = useState<Search | null>(initialSearch);
  const [pair, setPair] = useState<Pair | null>(null);
  const [list, setList] = useState<Itin[] | null>(null);
  const [listErr, setListErr] = useState<string | null>(null);
  const [pinned, setPinned] = useState<Itin | null>(null);
  const [returns, setReturns] = useState<Itin[] | null>(null);
  const [filterStops, setFilterStops] = useState<number | 'any'>('any');
  const [airlines, setAirlines] = useState<Set<string>>(new Set());
  const [maxDur, setMaxDur] = useState(0);
  const [sortBy, setSortBy] = useState<SortKey>('price');
  const [adultsOnly, setAdultsOnly] = useState(false);
  const [showAllReturns, setShowAllReturns] = useState(false);
  const [manualOpen, setManualOpen] = useState(false);
  const [mState, mAction] = useActionState<ActionState, FormData>(manualFlightAction, {});
  const [stale, setStale] = useState(false);
  const [pending, setPending] = useState<Set<string>>(new Set());
  const [actionErr, setActionErr] = useState<string | null>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const resultsRef = useRef<HTMLElement>(null);
  const seq = useRef(0);
  const autoOpened = useRef<string | null>(null);

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
    const my = ++seq.current;
    setPair(p); setList(null); setReturns(null); setPinned(null); setListErr(null);
    try {
      const res = await fetch(`/api/trips/${tripId}/flights?depart=${p.depart}${p.back ? `&return=${p.back}` : ''}`);
      const data = await res.json();
      if (my !== seq.current) return; // a newer click superseded this response
      if (!res.ok) { setListErr(data.error?.message ?? 'Failed to load flights'); return; }
      setList(data.itineraries ?? []);
      setAirlines(new Set());
    } catch {
      if (my === seq.current) setListErr('Request failed — check your connection and retry.');
    }
  }

  async function chooseReturn(it: Itin) {
    const my = ++seq.current;
    setPinned(it); setReturns(null); setListErr(null); setShowAllReturns(false);
    resultsRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    try {
      const res = await fetch(`/api/trips/${tripId}/flights/returns?depart=${pair!.depart}&return=${pair!.back}&outbound=${it.id}`);
      const data = await res.json();
      if (my !== seq.current) return;
      if (!res.ok) { setListErr(data.error?.message ?? 'Failed to load returns'); return; }
      setReturns(data.itineraries ?? []);
    } catch {
      if (my === seq.current) setListErr('Request failed — check your connection and retry.');
    }
  }

  async function shortlist(it: Itin) {
    const key = flightKey(it);
    setPending((s) => new Set(s).add(key));
    setActionErr(null);
    try {
      const fd = new FormData();
      fd.set('tripId', tripId);
      fd.set('itinerary', JSON.stringify(it));
      await shortlistFlightAction(fd);
    } catch {
      setActionErr('Could not shortlist that flight — please try again.');
    } finally {
      setPending((s) => { const n = new Set(s); n.delete(key); return n; });
    }
  }

  const pairs = search?.result?.pairs ?? [];
  const priced = pairs.filter((p) => p.minTotal !== null);
  const lo = priced.length ? Math.min(...priced.map((p) => p.minTotal!)) : null;
  const hi = priced.length ? Math.max(...priced.map((p) => p.minTotal!)) : null;
  const varied = lo !== null && hi !== null && hi > lo;
  const cheapest = priced.find((p) => p.minTotal === lo) ?? null;
  const searchId = search?.id;
  const scanDone = search?.status === 'done';

  // Land on results: open the cheapest date pair once per finished scan.
  const autoOpen = useEffectEvent(() => {
    if (!searchId || autoOpened.current === searchId || pair || !cheapest) return;
    autoOpened.current = searchId;
    void openPair(cheapest);
  });
  useEffect(() => { if (scanDone) autoOpen(); }, [scanDone, searchId]);

  const shortlistedKeys = new Set(options.map((o) => o.externalId).filter((k): k is string => !!k));
  const isShortlisted = (k: string) => shortlistedKeys.has(k);
  const isPending = (k: string) => pending.has(k);

  const wellFormed = (list ?? []).filter(isWellFormedItin);
  const visible = wellFormed.filter((it) =>
    (filterStops === 'any' || it.outbound.stops <= filterStops) &&
    (airlines.size === 0 || it.outbound.airlines.some((a) => airlines.has(a))) &&
    (maxDur === 0 || it.outbound.durationMin <= maxDur),
  ).sort((a, b) =>
    sortBy === 'price' ? (a.price.total ?? 1e15) - (b.price.total ?? 1e15)
    : sortBy === 'duration' ? a.outbound.durationMin - b.outbound.durationMin
    : sortBy === 'emissions' ? (a.outbound.emissionsKg ?? 1e15) - (b.outbound.emissionsKg ?? 1e15)
    : a.outbound.departLocal.localeCompare(b.outbound.departLocal));
  const airlineName = new Map<string, string>();
  for (const it of wellFormed) for (const s of it.outbound.segments) airlineName.set(s.airlineCode, s.airlineName || s.airlineCode);
  const allAirlines = [...new Set(wellFormed.flatMap((i) => i.outbound.airlines))];

  const scanFailed = search && (search.status === 'failed' || pairs.some((p) => p.error && (p.error.kind === 'blocked' || p.error.kind === 'parse')));

  const returnInWindow = (it: Itin) =>
    !timePrefs.returnDepart || !it.return || !pair?.back ||
    passesWindow(
      it.return.departLocal, it.return.fromTz ?? 'UTC',
      timePrefs.returnDepart, timePrefs.timezone ?? 'UTC', pair.back,
    );
  const wellFormedReturns = (returns ?? []).filter(isWellFormedItin);
  const outsideCount = wellFormedReturns.filter((it) => !returnInWindow(it)).length;
  const visibleReturns = wellFormedReturns
    .filter((it) => showAllReturns || returnInWindow(it))
    .sort((a, b) =>
      sortBy === 'price' ? (a.price.total ?? 1e15) - (b.price.total ?? 1e15)
      : sortBy === 'duration' ? (a.return?.durationMin ?? 0) - (b.return?.durationMin ?? 0)
      : sortBy === 'emissions' ? (a.return?.emissionsKg ?? 1e15) - (b.return?.emissionsKg ?? 1e15)
      : (a.return?.departLocal ?? '').localeCompare(b.return?.departLocal ?? ''));

  const tableProps = {
    canEdit, travelers, isShortlisted, isPending, onShortlist: shortlist, sortBy, onSort: setSortBy,
  };

  return (
    <div className="flex flex-col gap-6">
      <section className={card}>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="text-sm font-medium text-neutral-800">{strategySummary}</p>
            <p className="mt-0.5 text-xs text-neutral-500">
              We price every date combination in your plan, then you compare flights side by side. Live Google Flights data.
            </p>
          </div>
          {canEdit && (
            <div className="flex flex-wrap items-center gap-2">
              {hasKids && (
                <label className="flex items-center gap-1.5 text-xs text-neutral-600">
                  <input type="checkbox" checked={adultsOnly} onChange={(e) => setAdultsOnly(e.target.checked)} className="accent-teal-600" />
                  Price as adults only
                </label>
              )}
              <form action={async (fd) => {
                setPair(null); setList(null); setPinned(null); setReturns(null);
                await startScanAction(fd);
                router.refresh();
              }}>
                <input type="hidden" name="tripId" value={tripId} />
                <input type="hidden" name="adultsOnly" value={adultsOnly ? '1' : '0'} />
                <SubmitButton className={btn}>{pairs.length ? 'Refresh prices' : 'Search flights'}</SubmitButton>
              </form>
              <button type="button" className={btn2} onClick={() => setManualOpen((v) => !v)} aria-expanded={manualOpen}>
                Add manually
              </button>
            </div>
          )}
        </div>
        {(timePrefs.outboundDepart || timePrefs.returnDepart) && (
          <p className="mt-2 flex items-start gap-1.5 text-xs text-neutral-500">
            <Clock aria-hidden className="mt-px h-3.5 w-3.5 shrink-0" />
            Your departure-time windows filter the results. A departure after midnight (airport time) counts as the next day.
          </p>
        )}
        {running && (
          <p className="mt-3 flex items-center gap-2 text-sm text-neutral-700" role="status">
            <Loader2 aria-hidden className="h-4 w-4 animate-spin text-teal-600" />
            Checking {search!.completed} of {plural(search!.total, 'date combination')}…
            <span className="inline-block h-2 w-40 overflow-hidden rounded bg-neutral-200 align-middle">
              <span className="block h-full bg-teal-500" style={{ width: `${(search!.completed / Math.max(1, search!.total)) * 100}%` }} />
            </span>
          </p>
        )}
        {search?.status === 'failed' && <p className="mt-2 text-sm text-red-600">Scan failed ({search.error}). Try Search flights again.</p>}
        {scanFailed && <p className="mt-2 rounded bg-amber-50 px-3 py-2 text-sm text-amber-800">Google Flights reading is temporarily failing; you can still add flights manually.</p>}
        {stale && <p className="mt-2 text-sm text-amber-700">This scan looks stalled — try Search flights again.</p>}
        {!search && !running && (
          <p className="mt-3 rounded-lg bg-neutral-50 px-3 py-2 text-sm text-neutral-600">
            {canEdit ? 'Start with Search flights — it takes a few seconds per date combination.' : 'No flight search yet.'}
          </p>
        )}
      </section>

      {manualOpen && canEdit && (
        <section className={card}>
          <h2 className="font-semibold">Add a flight manually</h2>
          <p className="mb-3 text-xs text-neutral-500">Booked elsewhere or not listed? Add it here and it joins the shortlist.</p>
          <form action={mAction} className="grid grid-cols-2 gap-3 text-sm sm:grid-cols-4">
            <input type="hidden" name="tripId" value={tripId} />
            <label className={lbl}>Airline code<input name="airlineCode" placeholder="DL" required maxLength={3} className={inp} /></label>
            <label className={lbl}>Flight number<input name="flightNumber" placeholder="272" required className={inp} /></label>
            <label className={lbl}>From airport<input name="from" placeholder="JFK" required maxLength={3} className={inp} /></label>
            <label className={lbl}>To airport<input name="to" placeholder="LIS" required maxLength={3} className={inp} /></label>
            <label className={lbl}>Departs<input name="departLocal" type="datetime-local" required className={inp} /></label>
            <label className={lbl}>Arrives<input name="arriveLocal" type="datetime-local" required className={inp} /></label>
            <label className={lbl}>Return departs (optional)<input name="returnDepartLocal" type="datetime-local" className={inp} /></label>
            <label className={lbl}>Return arrives (optional)<input name="returnArriveLocal" type="datetime-local" className={inp} /></label>
            <label className={lbl}>Total price<input name="price" type="number" step="0.01" min="0" className={inp} /></label>
            <label className={lbl}>Currency<input name="currency" defaultValue="USD" maxLength={3} className={inp} /></label>
            <label className={lbl}>Confirmation #<input name="bookingRef" className={inp} /></label>
            <div className="flex items-end"><SubmitButton className={btn}>Add flight</SubmitButton></div>
            {mState.error && <p role="alert" className="col-span-full text-sm text-red-600">{mState.error}</p>}
          </form>
        </section>
      )}

      {pairs.length > 0 && (
        <section className={card}>
          <div className="mb-2 flex flex-wrap items-baseline justify-between gap-2">
            <h2 className="font-semibold">Pick your dates</h2>
            <p className="text-xs text-neutral-500">
              Lowest round-trip price per date combination{travelers > 1 ? ` for ${plural(travelers, 'traveler')}` : ''}
            </p>
          </div>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4">
            {pairs.map((p) => {
              const active = pair?.depart === p.depart && pair?.back === p.back;
              const isLow = varied && p.minTotal === lo;
              return (
                <button
                  key={`${p.depart}|${p.back}`}
                  type="button"
                  aria-pressed={active}
                  onClick={() => openPair(p)}
                  className={`rounded-lg border px-3 py-2 text-left transition ${
                    active ? 'border-teal-600 ring-2 ring-teal-600/25' : 'border-neutral-200 hover:border-teal-400'
                  } ${isLow ? 'bg-teal-50' : p.status === 'error' ? 'bg-red-50' : 'bg-white'}`}
                >
                  <span className="block text-xs font-medium text-neutral-600">
                    {weekday(p.depart)} {shortDate(p.depart)} → {p.back ? `${weekday(p.back)} ${shortDate(p.back)}` : 'one-way'}
                  </span>
                  <span className="mt-0.5 block text-lg font-semibold leading-tight">
                    {p.status === 'pending' ? <span className="text-sm font-normal text-neutral-400">Checking…</span>
                      : p.status === 'error' ? <span className="text-sm font-normal text-red-700">Failed — retry</span>
                      : p.minTotal !== null ? money(p.minTotal, p.currency ?? 'USD')
                      : <span className="text-sm font-normal text-neutral-500">{p.verified === 'no_match' ? 'No return in your window' : 'No flights'}</span>}
                  </span>
                  <span className="block text-xs text-neutral-500">
                    {p.back ? plural(nightsBetween(p.depart, p.back), 'night') : 'One way'}
                    {isLow && <span className="font-medium text-teal-700"> · Cheapest</span>}
                  </span>
                </button>
              );
            })}
          </div>
        </section>
      )}

      {pair && (
        <section ref={resultsRef} className={`${card} scroll-mt-4`}>
          {!pinned ? (
            <>
              <div className="mb-3">
                <h2 className="font-semibold">
                  {pair.back ? 'Choose your outbound flight' : 'Choose your flight'} · {dayLabel(pair.depart)}
                </h2>
                <p className="text-xs text-neutral-500">
                  {pair.back
                    ? `Step 1 of 2. Prices are the lowest round trip with each outbound — you'll pick the return (${dayLabel(pair.back)}) next.`
                    : 'One-way prices.'}
                  {pair.back && timePrefs.returnDepart && ' “From” prices assume the cheapest return at any hour; returns inside your time window can cost more — the date card shows the lowest price that fits.'}
                </p>
              </div>
              <div className="mb-3 flex flex-wrap items-center gap-3 text-xs text-neutral-600">
                <label className="flex items-center gap-1">Stops
                  <select className={inp} value={filterStops} onChange={(e) => setFilterStops(e.target.value === 'any' ? 'any' : Number(e.target.value))}>
                    <option value="any">Any</option><option value="0">Nonstop only</option><option value="1">1 stop or fewer</option><option value="2">2 stops or fewer</option>
                  </select>
                </label>
                <label className="flex items-center gap-1">Max duration
                  <select className={inp} value={maxDur} onChange={(e) => setMaxDur(Number(e.target.value))}>
                    <option value="0">Any</option><option value="480">8h</option><option value="720">12h</option><option value="960">16h</option>
                  </select>
                </label>
                {allAirlines.length > 1 && (
                  <span className="flex flex-wrap items-center gap-1.5">
                    <span>Airlines</span>
                    {allAirlines.map((a) => (
                      <button
                        key={a} type="button" aria-pressed={airlines.has(a)}
                        onClick={() => setAirlines((s) => { const n = new Set(s); if (n.has(a)) n.delete(a); else n.add(a); return n; })}
                        className={`rounded-full border px-2 py-0.5 ${airlines.has(a) ? 'border-teal-600 bg-teal-50 text-teal-700' : 'border-neutral-300 hover:bg-neutral-100'}`}
                      >
                        {airlineName.get(a) ?? a}
                      </button>
                    ))}
                  </span>
                )}
              </div>
              {listErr && <p role="alert" className="text-sm text-red-600">{listErr}</p>}
              {actionErr && <p role="alert" className="mb-2 text-sm text-red-600">{actionErr}</p>}
              {!list && !listErr && (
                <p className="flex items-center gap-2 text-sm text-neutral-500">
                  <Loader2 aria-hidden className="h-4 w-4 animate-spin" />Loading…
                </p>
              )}
              {list && visible.length > 0 && (
                <FlightTable
                  {...tableProps} items={visible} mode={pair.back ? 'outbound' : 'oneway'}
                  onChooseReturn={pair.back ? chooseReturn : undefined} testId="outbound-table"
                />
              )}
              {list && visible.length === 0 && (
                <p className="text-sm text-neutral-500">
                  {wellFormed.length === 0 ? 'No flights found for these dates.' : 'No flights match the filters — loosen them above.'}
                </p>
              )}
            </>
          ) : (
            <>
              <div className="mb-3 flex flex-wrap items-start justify-between gap-2">
                <div>
                  <h2 className="font-semibold">Choose your return · {dayLabel(pair.back!)}</h2>
                  <p className="text-xs text-neutral-500">Step 2 of 2. Prices are the full round trip.</p>
                </div>
                <button type="button" className={btn2} onClick={() => { setPinned(null); setReturns(null); setListErr(null); }}>
                  <ArrowLeft aria-hidden className="h-3.5 w-3.5" /> Change outbound
                </button>
              </div>
              <div className="mb-3 rounded-lg border border-teal-200 bg-teal-50/50 px-3 py-2 text-sm">
                <span className="text-xs font-medium uppercase tracking-wide text-teal-700">Your outbound</span>
                <p>
                  <span className="font-medium">{airlineNames(pinned.outbound)}</span>
                  {' · '}{t(pinned.outbound.departLocal)} {pinned.outbound.from.code} → {t(pinned.outbound.arriveLocal)}
                  {plusOne(pinned.outbound.arriveLocal, pinned.outbound.segments)} {pinned.outbound.to.code}
                  {' · '}{fmtMin(pinned.outbound.durationMin)} · {stopsText(pinned.outbound)}
                </p>
              </div>
              {timePrefs.returnDepart && outsideCount > 0 && (
                <label className="mb-2 flex items-center gap-1.5 text-xs text-neutral-600">
                  <input type="checkbox" checked={showAllReturns} onChange={(e) => setShowAllReturns(e.target.checked)} className="accent-teal-600" />
                  Show returns outside your time window
                  <span className="text-neutral-400">({outsideCount} {showAllReturns ? 'included' : 'hidden'})</span>
                </label>
              )}
              {listErr && <p role="alert" className="text-sm text-red-600">{listErr}</p>}
              {actionErr && <p role="alert" className="mb-2 text-sm text-red-600">{actionErr}</p>}
              {!returns && !listErr && (
                <p className="flex items-center gap-2 text-sm text-neutral-500">
                  <Loader2 aria-hidden className="h-4 w-4 animate-spin" />Loading return flights
                </p>
              )}
              {returns && visibleReturns.length > 0 && (
                <FlightTable {...tableProps} items={visibleReturns} mode="return" testId="returns-table" />
              )}
              {returns && visibleReturns.length === 0 && (
                <p className="text-sm text-neutral-500">
                  {wellFormedReturns.length === 0
                    ? 'No return flights found for this outbound.'
                    : 'No return flights inside your time window — check the box above to see all.'}
                </p>
              )}
            </>
          )}
        </section>
      )}

      <ShortlistedOptions tripId={tripId} section="flights" title="Shortlisted flights" canEdit={canEdit} options={options} />
    </div>
  );
}
