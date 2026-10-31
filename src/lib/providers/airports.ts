import 'server-only';

export type Airport = {
  iata: string;
  name: string;
  city: string;
  region: string;
  country: string;
  lat: number;
  lon: number;
  tz: string;
  size: 'large' | 'medium' | 'small';
};

export type CityGroup = {
  type: 'city';
  city: string;
  countryCode: string;
  label: string;
  primaryIata: string;
  timezone: string;
  lat: number;
  lon: number;
  airports: Airport[];
};

export type AirportPlace = {
  type: 'airport';
  airport: Airport;
  label: string;
};

export type PlaceSearchResult = CityGroup | AirportPlace;

let airportsCache: Airport[] | null = null;
let byIata: Map<string, Airport> | null = null;

async function load(): Promise<Airport[]> {
  if (airportsCache) return airportsCache;
  const mod = (await import('@/data/airports.json')) as {
    default: Airport[];
  };
  airportsCache = mod.default;
  byIata = new Map(airportsCache.map((a) => [a.iata, a]));
  return airportsCache;
}

export function normalizeText(s: string): string {
  return s
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')

    .toLowerCase()
    .trim();
}

const SIZE_RANK = { large: 0, medium: 1, small: 2 } as const;

function compareAirports(a: Airport, b: Airport): number {
  return SIZE_RANK[a.size] - SIZE_RANK[b.size] || a.iata.localeCompare(b.iata);
}

function haversineKm(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number,
): number {
  const R = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(a));
}

const CITY_GROUP_RADIUS_KM = 70;

/**
 * A city group is (municipality, country) plus every large/medium airport
 * within 70 km of the group's primary airport (largest, then alphabetical).
 */
function buildCityGroup(
  airports: Airport[],
  all: Airport[],
  city: string,
  country: string,
): CityGroup {
  const own = airports
    .filter((a) => a.city === city && a.country === country)
    .sort(compareAirports);
  const primary = own[0];
  // The city's own airports of any size, plus large/medium airports of
  // neighbouring municipalities within 70 km of the primary.
  const groupAirports = all
    .filter(
      (a) =>
        (a.city === city && a.country === country) ||
        (a.size !== 'small' &&
          haversineKm(a.lat, a.lon, primary.lat, primary.lon) <=
            CITY_GROUP_RADIUS_KM),
    )
    .sort(compareAirports);
  return {
    type: 'city',
    city,
    countryCode: country,
    label: `${city}, ${country}`,
    primaryIata: primary.iata,
    timezone: primary.tz,
    lat: primary.lat,
    lon: primary.lon,
    airports: groupAirports,
  };
}

function airportResult(a: Airport): AirportPlace {
  return {
    type: 'airport',
    airport: a,
    label: `${a.iata} — ${a.name}, ${a.city}, ${a.country}`,
  };
}

/**
 * Diacritic-insensitive place search. Priority: exact IATA, then city
 * prefix (as city groups), then airport-name contains. City groups come
 * before individual airports.
 */
export async function searchPlaces(
  q: string,
  limit = 8,
): Promise<PlaceSearchResult[]> {
  const all = await load();
  const nq = normalizeText(q);
  if (nq.length < 2) return [];

  const results: PlaceSearchResult[] = [];

  if (/^[a-z]{3}$/.test(nq)) {
    const exact = (byIata ?? new Map(all.map((a) => [a.iata, a]))).get(
      nq.toUpperCase(),
    );
    if (exact) results.push(airportResult(exact));
  }

  // Candidate (city, country) keys, ranked by best airport size then name;
  // only the top 20 get the O(dataset) group expansion.
  const cityKeys = new Map<
    string,
    { city: string; country: string; best: number }
  >();
  for (const a of all) {
    if (!a.city) continue;
    if (normalizeText(a.city).startsWith(nq)) {
      const key = `${a.city}||${a.country}`;
      const cur = cityKeys.get(key);
      const rank = SIZE_RANK[a.size];
      if (!cur || rank < cur.best) {
        cityKeys.set(key, { city: a.city, country: a.country, best: rank });
      }
    }
  }
  const topCities = [...cityKeys.values()]
    .sort(
      (a, b) => a.best - b.best || a.city.localeCompare(b.city),
    )
    .slice(0, 20);
  const groups = topCities
    .map(({ city, country }) => buildCityGroup(all, all, city, country))
    .filter((g) => g.airports.length > 0);

  const nameMatches = all
    .filter((a) => normalizeText(a.name).includes(nq))
    .sort(compareAirports);

  results.push(...groups);
  for (const a of nameMatches) {
    if (results.some((r) => r.type === 'airport' && r.airport.iata === a.iata)) {
      continue;
    }
    results.push(airportResult(a));
  }

  return results.slice(0, limit);
}

export async function getAirport(iata: string): Promise<Airport | undefined> {
  await load();
  return byIata!.get(iata.toUpperCase());
}

export async function airportsNear(
  lat: number,
  lon: number,
  km: number,
): Promise<Airport[]> {
  const all = await load();
  return all
    .filter((a) => haversineKm(lat, lon, a.lat, a.lon) <= km)
    .sort(
      (a, b) =>
        haversineKm(lat, lon, a.lat, a.lon) -
        haversineKm(lat, lon, b.lat, b.lon),
    );
}
