'use client';

import { useActionState, useMemo, useState } from 'react';
import { createTripAction, type TripFormState } from '@/lib/actions/trips';
import {
  candidatePairs,
  describeStrategy,
  type DateStrategy,
  type TimeWindow,
  type Weekday,
} from '@/lib/domain/dates/strategy';
import { PlacePicker, type PlaceSelection } from './place-picker';

const inputCls =
  'w-full rounded-lg border border-neutral-300 px-3 py-2 text-sm focus:border-teal-500 focus:outline-none focus:ring-2 focus:ring-teal-500/30';
const labelCls = 'block text-sm font-medium text-neutral-700';
const sectionCls =
  'rounded-xl border border-neutral-200 bg-white p-5 shadow-sm flex flex-col gap-4';

const US_ZONES = [
  'America/New_York',
  'America/Chicago',
  'America/Denver',
  'America/Los_Angeles',
  'America/Anchorage',
  'Pacific/Honolulu',
];

const WEEKDAYS: { value: Weekday; label: string }[] = [
  { value: 1, label: 'Mon' },
  { value: 2, label: 'Tue' },
  { value: 3, label: 'Wed' },
  { value: 4, label: 'Thu' },
  { value: 5, label: 'Fri' },
  { value: 6, label: 'Sat' },
  { value: 7, label: 'Sun' },
];

type StrategyKind = DateStrategy['kind'];

export function TripWizard({
  homeTimezone,
  defaultCurrency,
  maxPairs,
  today,
}: {
  homeTimezone: string;
  defaultCurrency: string;
  maxPairs: number;
  today: string;
}) {
  const [state, action, pending] = useActionState<TripFormState, FormData>(
    createTripAction,
    {},
  );

  const [origin, setOrigin] = useState<PlaceSelection | null>(null);
  const [destination, setDestination] = useState<PlaceSelection | null>(null);
  const [adults, setAdults] = useState(1);
  const [childrenAges, setChildrenAges] = useState<number[]>([]);
  const [kind, setKind] = useState<StrategyKind>('weekends_in_month');
  const [exactDepart, setExactDepart] = useState('');
  const [exactReturn, setExactReturn] = useState('');
  const [oneWay, setOneWay] = useState(false);
  const [month, setMonth] = useState('');
  const [departWeekday, setDepartWeekday] = useState<Weekday>(5);
  const [departFlex, setDepartFlex] = useState(1);
  const [returnWeekday, setReturnWeekday] = useState<Weekday>(1);
  const [returnFlex, setReturnFlex] = useState(0);
  const [anchorDate, setAnchorDate] = useState('');
  const [anchorFlex, setAnchorFlex] = useState(1);
  const [anchorReturnFlex, setAnchorReturnFlex] = useState(0);
  const [anchorReturnWeekday, setAnchorReturnWeekday] = useState<Weekday>(1);
  const [earliestDepart, setEarliestDepart] = useState('');
  const [latestReturn, setLatestReturn] = useState('');
  const [minNights, setMinNights] = useState(3);
  const [maxNights, setMaxNights] = useState(7);
  const [tz, setTz] = useState(homeTimezone);
  const [outEnabled, setOutEnabled] = useState(false);
  const [outStart, setOutStart] = useState('08:00');
  const [outEnd, setOutEnd] = useState('12:00');
  const [retEnabled, setRetEnabled] = useState(false);
  const [retStart, setRetStart] = useState('17:00');
  const [retEnd, setRetEnd] = useState('23:59');
  const [cabin, setCabin] = useState('economy');
  const [maxStops, setMaxStops] = useState('any');
  const [currency, setCurrency] = useState(defaultCurrency);
  const [name, setName] = useState('');

  const strategy: DateStrategy | null = useMemo(() => {
    switch (kind) {
      case 'exact':
        if (!exactDepart) return null;
        if (!oneWay && !exactReturn) return null;
        return {
          kind: 'exact',
          departDate: exactDepart,
          returnDate: oneWay ? null : exactReturn,
        };
      case 'weekends_in_month':
        if (!month) return null;
        return {
          kind: 'weekends_in_month',
          month,
          departWeekday,
          departFlexDays: departFlex as 0 | 1 | 2,
          returnWeekday,
          returnFlexDays: returnFlex as 0 | 1 | 2,
        };
      case 'around_date':
        if (!anchorDate) return null;
        return {
          kind: 'around_date',
          anchorDate,
          departFlexDays: anchorFlex as 0 | 1 | 2 | 3,
          returnWeekday: anchorReturnWeekday,
          returnFlexDays: anchorReturnFlex as 0 | 1 | 2 | 3,
        };
      case 'range':
        if (!earliestDepart || !latestReturn) return null;
        return {
          kind: 'range',
          earliestDepart,
          latestReturn,
          minNights,
          maxNights,
        };
    }
  }, [
    kind, exactDepart, exactReturn, oneWay, month, departWeekday, departFlex,
    returnWeekday, returnFlex, anchorDate, anchorFlex, anchorReturnWeekday,
    anchorReturnFlex, earliestDepart, latestReturn, minNights, maxNights,
  ]);

  const timePrefs = useMemo(() => {
    const outboundDepart: TimeWindow | undefined = outEnabled
      ? { start: outStart, end: outEnd }
      : undefined;
    const returnDepart: TimeWindow | undefined = retEnabled
      ? { start: retStart, end: retEnd }
      : undefined;
    return { timezone: tz, outboundDepart, returnDepart };
  }, [tz, outEnabled, outStart, outEnd, retEnabled, retStart, retEnd]);


  const pairsInfo = useMemo(() => {
    if (!strategy) return null;
    return candidatePairs(strategy, today, maxPairs);
  }, [strategy, today, maxPairs]);

  const totalTravelers = adults + childrenAges.length;
  const lapInfants = childrenAges.filter((a) => a < 2).length;

  const clientErrors: string[] = [];
  if (totalTravelers > 9) clientErrors.push('At most 9 travelers total.');
  if (lapInfants > adults)
    clientErrors.push('Lap infants (under 2) cannot outnumber adults.');
  if (origin && origin.airports.length === 0)
    clientErrors.push('Select at least one origin airport.');
  if (destination && destination.airports.length === 0)
    clientErrors.push('Select at least one destination airport.');
  if (pairsInfo && !pairsInfo.ok) clientErrors.push(pairsInfo.error);
  if (
    strategy?.kind === 'exact' &&
    strategy.returnDate &&
    strategy.returnDate <= strategy.departDate
  )
    clientErrors.push('Return date must be after the departure date.');

  if (
    kind === 'exact' &&
    exactDepart &&
    !oneWay &&
    !exactReturn
  )
    clientErrors.push('Pick a return date or choose One-way.');
  if (outEnabled && outStart >= outEnd)
    clientErrors.push('Outbound window start must be before its end.');
  if (retEnabled && retStart >= retEnd)
    clientErrors.push('Return window start must be before its end.');

  const canSubmit =
    !!origin && !!destination && !!strategy && clientErrors.length === 0;

  const tzOptions = useMemo(() => {
    const set = new Set<string>(US_ZONES);
    set.add(homeTimezone);
    if (origin?.timezone) set.add(origin.timezone);
    if (destination?.timezone) set.add(destination.timezone);
    if (tz) set.add(tz);
    return [...set];
  }, [homeTimezone, origin, destination, tz]);

  const payload = useMemo(
    () =>
      JSON.stringify({
        name: name || undefined,
        origin: origin && {
          city: origin.city,
          countryCode: origin.countryCode,
          airports: origin.airports,
          primaryIata: origin.primaryIata,
        },
        destination: destination && {
          city: destination.city,
          countryCode: destination.countryCode,
          airports: destination.airports,
          primaryIata: destination.primaryIata,
        },
        adults,
        childrenAges,
        cabin,
        maxStops,
        currency,
        dateStrategy: strategy,
        timePrefs,
      }),
    [
      name, origin, destination, adults, childrenAges, cabin, maxStops,
      currency, strategy, timePrefs,
    ],
  );

  const kindBtn = (k: StrategyKind, label: string) => (
    <button
      key={k}
      type="button"
      onClick={() => setKind(k)}
      className={`rounded-lg px-3 py-1.5 text-sm font-medium ${
        kind === k
          ? 'bg-teal-600 text-white'
          : 'bg-neutral-100 text-neutral-700 hover:bg-neutral-200'
      }`}
    >
      {label}
    </button>
  );

  const flexSelect = (
    val: number,
    set: (n: number) => void,
    max: number,
    ariaLabel: string,
  ) => (
    <select
      value={val}
      onChange={(e) => set(Number(e.target.value))}
      className={inputCls}
      aria-label={ariaLabel}
    >
      {Array.from({ length: max + 1 }, (_, i) => (
        <option key={i} value={i}>
          {i === 0 ? 'exact day' : `±${i} day${i === 1 ? '' : 's'}`}
        </option>
      ))}
    </select>
  );

  const weekdaySelect = (
    val: Weekday,
    set: (w: Weekday) => void,
    ariaLabel: string,
  ) => (
    <select
      value={val}
      onChange={(e) => set(Number(e.target.value) as Weekday)}
      className={inputCls}
      aria-label={ariaLabel}
    >
      {WEEKDAYS.map((w) => (
        <option key={w.value} value={w.value}>
          {w.label}
        </option>
      ))}
    </select>
  );

  return (
    <form action={action} className="flex flex-col gap-6">
      <input type="hidden" name="payload" value={payload} />

      <section className={sectionCls}>
        <h2 className="font-semibold">Where to?</h2>
        <div className="grid gap-4 sm:grid-cols-2">
          <PlacePicker label="From" value={origin} onChange={setOrigin} />
          <PlacePicker
            label="To"
            value={destination}
            onChange={setDestination}
          />
        </div>
      </section>

      <section className={sectionCls}>
        <h2 className="font-semibold">Who&apos;s going?</h2>
        <div className="flex flex-wrap items-end gap-4">
          <div>
            <label htmlFor="adults" className={labelCls}>
              Adults
            </label>
            <input
              id="adults"
              type="number"
              min={1}
              max={9}
              value={adults}
              onChange={(e) => setAdults(Number(e.target.value))}
              className={`${inputCls} w-24`}
            />
          </div>
          <div>
            <label htmlFor="childCount" className={labelCls}>
              Children (0–17)
            </label>
            <input
              id="childCount"
              type="number"
              min={0}
              max={8}
              value={childrenAges.length}
              onChange={(e) => {
                const n = Math.max(0, Number(e.target.value));
                setChildrenAges((prev) =>
                  Array.from({ length: n }, (_, i) => prev[i] ?? 5),
                );
              }}
              className={`${inputCls} w-24`}
            />
          </div>
        </div>
        {childrenAges.length > 0 && (
          <div className="flex flex-wrap gap-3">
            {childrenAges.map((age, i) => (
              <div key={i}>
                <label htmlFor={`child-age-${i}`} className="text-xs text-neutral-500">
                  Child {i + 1} age
                </label>
                <input
                  id={`child-age-${i}`}
                  type="number"
                  min={0}
                  max={17}
                  value={age}
                  onChange={(e) =>
                    setChildrenAges((prev) =>
                      prev.map((a, j) => (j === i ? Number(e.target.value) : a)),
                    )
                  }
                  className={`${inputCls} w-20`}
                />
              </div>
            ))}
          </div>
        )}
      </section>

      <section className={sectionCls}>
        <h2 className="font-semibold">When?</h2>
        <div className="flex flex-wrap gap-2" role="tablist">
          {kindBtn('exact', 'Exact dates')}
          {kindBtn('weekends_in_month', 'Weekends in a month')}
          {kindBtn('around_date', 'Around a date')}
          {kindBtn('range', 'Flexible range')}
        </div>

        {kind === 'exact' && (
          <div className="flex flex-wrap items-end gap-4">
            <div>
              <label htmlFor="exact-depart" className={labelCls}>Depart</label>
              <input
                id="exact-depart"
                type="date"
                value={exactDepart}
                onChange={(e) => setExactDepart(e.target.value)}
                className={inputCls}
              />
            </div>
            {!oneWay && (
              <div>
                <label htmlFor="exact-return" className={labelCls}>Return</label>
                <input
                  id="exact-return"
                  type="date"
                  value={exactReturn}
                  onChange={(e) => setExactReturn(e.target.value)}
                  className={inputCls}
                />
              </div>
            )}
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={oneWay}
                onChange={(e) => setOneWay(e.target.checked)}
                className="accent-teal-600"
              />
              One-way
            </label>
          </div>
        )}

        {kind === 'weekends_in_month' && (
          <div className="flex flex-wrap items-end gap-4">
            <div>
              <label htmlFor="wim-month" className={labelCls}>Month</label>
              <input
                id="wim-month"
                type="month"
                value={month}
                onChange={(e) => setMonth(e.target.value)}
                className={inputCls}
              />
            </div>
            <div>
              <span className={labelCls}>Leave</span>
              <div className="flex gap-2">
                {weekdaySelect(departWeekday, setDepartWeekday, 'Leave weekday')}
                {flexSelect(departFlex, setDepartFlex, 2, 'Leave flexibility')}
              </div>
            </div>
            <div>
              <span className={labelCls}>Back</span>
              <div className="flex gap-2">
                {weekdaySelect(returnWeekday, setReturnWeekday, 'Return weekday')}
                {flexSelect(returnFlex, setReturnFlex, 2, 'Return flexibility')}
              </div>
            </div>
          </div>
        )}

        {kind === 'around_date' && (
          <div className="flex flex-wrap items-end gap-4">
            <div>
              <label htmlFor="anchor" className={labelCls}>Around</label>
              <input
                id="anchor"
                type="date"
                value={anchorDate}
                onChange={(e) => setAnchorDate(e.target.value)}
                className={inputCls}
              />
            </div>
            <div>
              <span className={labelCls}>Leave</span>
              {flexSelect(anchorFlex, setAnchorFlex, 3, 'Departure flexibility')}
            </div>
            <div>
              <span className={labelCls}>Back</span>
              <div className="flex gap-2">
                {weekdaySelect(anchorReturnWeekday, setAnchorReturnWeekday, 'Return weekday')}
                {flexSelect(anchorReturnFlex, setAnchorReturnFlex, 3, 'Return flexibility')}
              </div>
            </div>
          </div>
        )}

        {kind === 'range' && (
          <div className="flex flex-wrap items-end gap-4">
            <div>
              <label htmlFor="range-depart" className={labelCls}>Earliest departure</label>
              <input
                id="range-depart"
                type="date"
                value={earliestDepart}
                onChange={(e) => setEarliestDepart(e.target.value)}
                className={inputCls}
              />
            </div>
            <div>
              <label htmlFor="range-return" className={labelCls}>Latest return</label>
              <input
                id="range-return"
                type="date"
                value={latestReturn}
                onChange={(e) => setLatestReturn(e.target.value)}
                className={inputCls}
              />
            </div>
            <div>
              <label htmlFor="min-nights" className={labelCls}>Min nights</label>
              <input
                id="min-nights"
                type="number"
                min={0}
                max={60}
                value={minNights}
                onChange={(e) => setMinNights(Number(e.target.value))}
                className={`${inputCls} w-20`}
              />
            </div>
            <div>
              <label htmlFor="max-nights" className={labelCls}>Max nights</label>
              <input
                id="max-nights"
                type="number"
                min={0}
                max={60}
                value={maxNights}
                onChange={(e) => setMaxNights(Number(e.target.value))}
                className={`${inputCls} w-20`}
              />
            </div>
          </div>
        )}

        {strategy && (
          <p className="rounded-lg bg-teal-50 px-3 py-2 text-sm text-teal-900" data-testid="strategy-summary">
            {describeStrategy(strategy, timePrefs)}
            {pairsInfo && pairsInfo.ok && (
              <span className="ml-2 text-neutral-600">
                · {pairsInfo.pairs.length} date combination
                {pairsInfo.pairs.length === 1 ? '' : 's'} to check
              </span>
            )}
          </p>
        )}
      </section>

      <section className={sectionCls}>
        <h2 className="font-semibold">Departure time windows</h2>
        <div>
          <label htmlFor="tz" className={labelCls}>
            Window timezone
          </label>
          <select
            id="tz"
            value={tz}
            onChange={(e) => setTz(e.target.value)}
            className={inputCls}
          >
            {tzOptions.map((z) => (
              <option key={z} value={z}>
                {z}
              </option>
            ))}
          </select>
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label className="flex items-center gap-2 text-sm font-medium text-neutral-700">
              <input
                type="checkbox"
                checked={outEnabled}
                onChange={(e) => setOutEnabled(e.target.checked)}
                className="accent-teal-600"
              />
              Outbound departs between
            </label>
            {outEnabled && (
              <div className="mt-2 flex items-center gap-2">
                <input
                  type="time"
                  aria-label="Outbound earliest"
                  value={outStart}
                  onChange={(e) => setOutStart(e.target.value)}
                  className={inputCls}
                />
                <span className="text-sm text-neutral-500">and</span>
                <input
                  type="time"
                  aria-label="Outbound latest"
                  value={outEnd}
                  onChange={(e) => setOutEnd(e.target.value)}
                  className={inputCls}
                />
              </div>
            )}
          </div>
          <div>
            <label className="flex items-center gap-2 text-sm font-medium text-neutral-700">
              <input
                type="checkbox"
                checked={retEnabled}
                onChange={(e) => setRetEnabled(e.target.checked)}
                className="accent-teal-600"
              />
              Return departs between
            </label>
            {retEnabled && (
              <div className="mt-2 flex items-center gap-2">
                <input
                  type="time"
                  aria-label="Return earliest"
                  value={retStart}
                  onChange={(e) => setRetStart(e.target.value)}
                  className={inputCls}
                />
                <span className="text-sm text-neutral-500">and</span>
                <input
                  type="time"
                  aria-label="Return latest"
                  value={retEnd}
                  onChange={(e) => setRetEnd(e.target.value)}
                  className={inputCls}
                />
              </div>
            )}
          </div>
        </div>
      </section>

      <section className={sectionCls}>
        <h2 className="font-semibold">Flight preferences</h2>
        <div className="grid gap-4 sm:grid-cols-3">
          <div>
            <label htmlFor="cabin" className={labelCls}>Cabin</label>
            <select
              id="cabin"
              value={cabin}
              onChange={(e) => setCabin(e.target.value)}
              className={inputCls}
            >
              <option value="economy">Economy</option>
              <option value="premium_economy">Premium economy</option>
              <option value="business">Business</option>
              <option value="first">First</option>
            </select>
          </div>
          <div>
            <label htmlFor="maxStops" className={labelCls}>Max stops</label>
            <select
              id="maxStops"
              value={maxStops}
              onChange={(e) => setMaxStops(e.target.value)}
              className={inputCls}
            >
              <option value="any">Any</option>
              <option value="nonstop">Nonstop</option>
              <option value="one">Up to 1 stop</option>
              <option value="two">Up to 2 stops</option>
            </select>
          </div>
          <div>
            <label htmlFor="currency" className={labelCls}>Currency</label>
            <input
              id="currency"
              value={currency}
              onChange={(e) => setCurrency(e.target.value.toUpperCase())}
              maxLength={3}
              className={`${inputCls} w-24`}
            />
          </div>
        </div>
        <div>
          <label htmlFor="tripName" className={labelCls}>
            Trip name <span className="font-normal text-neutral-500">(optional)</span>
          </label>
          <input
            id="tripName"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder={
              destination ? `Trip to ${destination.city}` : 'Trip name'
            }
            className={inputCls}
          />
        </div>
      </section>

      {clientErrors.map((e) => (
        <p key={e} role="alert" className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">
          {e}
        </p>
      ))}
      {state.error && (
        <p role="alert" className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">
          {state.error}
        </p>
      )}

      <button
        type="submit"
        disabled={!canSubmit || pending}
        className="self-start rounded-lg bg-teal-600 px-6 py-2.5 font-medium text-white hover:bg-teal-700 disabled:opacity-50"
      >
        {pending ? 'Creating…' : 'Create trip'}
      </button>
    </form>
  );
}
