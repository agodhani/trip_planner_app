'use client';

import { useEffect, useRef, useState } from 'react';

export type AirportOption = { iata: string; name: string };

export type PlaceSelection = {
  label: string;
  city: string;
  countryCode: string;
  airports: string[];
  primaryIata: string;
  timezone: string;
  availableAirports: AirportOption[];
};

type CityResult = {
  type: 'city';
  city: string;
  countryCode: string;
  label: string;
  primaryIata: string;
  timezone: string;
  airports: { iata: string; name: string }[];
};
type AirportResult = {
  type: 'airport';
  airport: { iata: string; name: string; city: string; country: string; tz: string };
  label: string;
};
type SearchResult = CityResult | AirportResult;

const inputCls =
  'w-full rounded-lg border border-neutral-300 px-3 py-2 text-sm focus:border-teal-500 focus:outline-none focus:ring-2 focus:ring-teal-500/30';

export function PlacePicker({
  label,
  value,
  onChange,
}: {
  label: string;
  value: PlaceSelection | null;
  onChange: (sel: PlaceSelection | null) => void;
}) {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<SearchResult[]>([]);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const boxRef = useRef<HTMLDivElement>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    function onClick(e: MouseEvent) {
      if (boxRef.current && !boxRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener('mousedown', onClick);
    return () => document.removeEventListener('mousedown', onClick);
  }, []);

  function onQueryChange(v: string) {
    setQuery(v);
    if (timer.current) clearTimeout(timer.current);
    if (v.trim().length < 2) {
      setResults([]);
      setOpen(false);
      return;
    }
    timer.current = setTimeout(async () => {
      setLoading(true);
      try {
        const res = await fetch(`/api/places?q=${encodeURIComponent(v.trim())}`);
        if (res.ok) {
          const data = (await res.json()) as { results: SearchResult[] };
          setResults(data.results);
          setOpen(true);
        }
      } finally {
        setLoading(false);
      }
    }, 250);
  }

  function pick(r: SearchResult) {
    if (r.type === 'city') {
      onChange({
        label: r.label,
        city: r.city,
        countryCode: r.countryCode,
        airports: r.airports.map((a) => a.iata),
        primaryIata: r.primaryIata,
        timezone: r.timezone,
        availableAirports: r.airports.map((a) => ({
          iata: a.iata,
          name: a.name,
        })),
      });
    } else {
      onChange({
        label: r.label,
        city: r.airport.city,
        countryCode: r.airport.country,
        airports: [r.airport.iata],
        primaryIata: r.airport.iata,
        timezone: r.airport.tz,
        availableAirports: [{ iata: r.airport.iata, name: r.airport.name }],
      });
    }
    setQuery('');
    setResults([]);
    setOpen(false);
  }

  function toggleAirport(iata: string) {
    if (!value) return;
    const has = value.airports.includes(iata);
    const next = has
      ? value.airports.filter((a) => a !== iata)
      : [...value.airports, iata];
    onChange({ ...value, airports: next });
  }

  return (
    <div>
      <span className="block text-sm font-medium text-neutral-700">{label}</span>
      {value ? (
        <div className="mt-1 rounded-lg border border-teal-300 bg-teal-50 p-3">
          <div className="flex items-center justify-between">
            <span className="text-sm font-medium">{value.label}</span>
            <button
              type="button"
              onClick={() => onChange(null)}
              className="text-xs text-neutral-500 underline"
            >
              Change
            </button>
          </div>
          {value.availableAirports.length > 1 && (
            <fieldset className="mt-2">
              <legend className="text-xs text-neutral-500">Airports</legend>
              <div className="mt-1 flex flex-wrap gap-x-4 gap-y-1">
                {value.availableAirports.map((a) => (
                  <label
                    key={a.iata}
                    className="flex items-center gap-1.5 text-sm"
                  >
                    <input
                      type="checkbox"
                      checked={value.airports.includes(a.iata)}
                      onChange={() => toggleAirport(a.iata)}
                      className="accent-teal-600"
                    />
                    {a.iata}
                  </label>
                ))}
              </div>
            </fieldset>
          )}
        </div>
      ) : (
        <div className="relative mt-1" ref={boxRef}>
          <input
            value={query}
            onChange={(e) => onQueryChange(e.target.value)}
            onFocus={() => results.length > 0 && setOpen(true)}
            placeholder="City or airport, e.g. Lisbon or JFK"
            className={inputCls}
            role="combobox"
            aria-expanded={open}
            aria-controls={`${label}-suggestions`}
            aria-label={label}
          />
          {open && (
            <ul
              id={`${label}-suggestions`}
              className="absolute z-20 mt-1 max-h-64 w-full overflow-auto rounded-lg border border-neutral-200 bg-white shadow-lg"
            >
              {results.map((r) => (
                <li key={r.type === 'city' ? `c-${r.label}` : `a-${r.airport.iata}`}>
                  <button
                    type="button"
                    onClick={() => pick(r)}
                    className="w-full px-3 py-2 text-left text-sm hover:bg-teal-50"
                  >
                    {r.type === 'city' ? (
                      <>
                        <span className="font-medium">{r.label}</span>
                        <span className="ml-2 text-xs text-neutral-500">
                          {r.airports.map((a) => a.iata).join(', ')}
                        </span>
                      </>
                    ) : (
                      r.label
                    )}
                  </button>
                </li>
              ))}
              {results.length === 0 && !loading && (
                <li className="px-3 py-2 text-sm text-neutral-500">
                  No matching places
                </li>
              )}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
