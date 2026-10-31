/**
 * Records real provider responses into tests/fixtures/. The Nominatim
 * throttle (1 req/s) and User-Agent are applied by the provider adapter.
 *
 * Usage:
 *   npm run fixtures:record                          # default E2E geocodes
 *   npx tsx scripts/record-fixtures.ts "Paris, FR"   # extra geocodes
 */
try {
  process.loadEnvFile('.env.local');
} catch {
  // no local env file
}

process.env.TP_RECORD_FIXTURES = 'tests/fixtures';

const DEFAULT_GEOCODES = ['Lisbon, PT', 'New York, US'];

async function main() {
  const { fetchGeocodeRaw, GEOCODE_PARAMS } = await import(
    '../src/lib/providers/osm/nominatim'
  );

  const queries = process.argv.slice(2);
  const geocodes = queries.length > 0 ? queries : DEFAULT_GEOCODES;

  for (const q of geocodes) {
    const hits = await fetchGeocodeRaw(GEOCODE_PARAMS(q));
    console.log(`geocode "${q}": ${hits.length} hits`);
  }

  // Google Flights fixtures for the E2E scenario: NYC group -> LIS,
  // around_date Dec 4 2026 ±1 -> departs Dec 3/4/5, back Mon Dec 7.
  const gf = process.env.GF_FIXTURES !== '0';
  if (gf) {
    const { searchOutbounds, searchReturns } = await import('../src/lib/providers/googleFlights');
    const base = {
      originAirports: ['EWR', 'JFK', 'LGA', 'HPN', 'ISP', 'TEB'],
      destinationAirports: ['LIS', 'CAT'],
      adults: 1, children: 0, infantsInSeat: 0, infantsOnLap: 0,
      cabin: 'economy' as const, maxStops: 'any' as const, currency: 'USD',
    };
    for (const depart of ['2026-12-03', '2026-12-04', '2026-12-05']) {
      const r = await searchOutbounds({ ...base, outboundDate: depart, returnDate: '2026-12-07' });
      console.log(`outbounds ${depart}: ${r.itineraries.length} itineraries`);
      const priced = r.itineraries.filter((i) => i.price.total !== null).sort((a, b) => a.price.total! - b.price.total!).slice(0, 3);
      for (const cand of priced) {
        const rr = await searchReturns({ ...base, outboundDate: depart, returnDate: '2026-12-07' }, cand);
        console.log(`  returns for ${cand.id.slice(0, 8)}: ${rr.itineraries.length}`);
      }
    }
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

export {};
