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
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
