# TripPlanner

A collaborative trip planner: pick a destination, a date strategy (exact,
weekends-in-month, ±N days, flexible range), compare real flight options,
then plan stay, activities, transport, itinerary, budget, and a trip log —
together, via invite links.

## Setup

1. **Postgres** (Docker):

   ```bash
   docker compose up -d
   ```

   Starts Postgres 17 on host port **5434** with databases `tripplanner` and
   `tripplanner_test` (user/password: `tripplanner`/`tripplanner`).

2. **Env**: copy `.env.example` to `.env.local` (already valid for local dev).

3. **Install + migrate**:

   ```bash
   npm install
   npm run db:migrate
   ```

4. **Run**:

   ```bash
   npm run dev   # http://localhost:3030
   ```

### Live checks

- `npm run smoke:flights -- JFK LIS 2026-12-04 2026-12-07` — fetches a real Google Flights page (no DB) and prints the top 5 itineraries. Run this first when flight results look wrong: it isolates the reader from the app.

### Google Flights fragility

The flights reader scrapes the public `/travel/flights` page (`ds:1` payload), not an API. Google may change the payload shape, serve a consent interstitial (mapped to a `blocked` error), or throttle (403/429 ⇒ `blocked`). Trips keep working — manual flight entry is always available.

## Scripts

| Command | Purpose |
| --- | --- |
| `npm run dev` / `build` / `start` | Next.js on port 3030 |
| `npm run lint` / `typecheck` | ESLint / `tsc --noEmit` |
| `npm test` | Vitest unit tests (`tests/unit`) |
| `npm run test:e2e` | Playwright E2E (`tests/e2e`, port 3100, test DB + fixtures) |
| `npm run db:generate` / `db:migrate` / `db:studio` | Drizzle migrations |
| `npm run data:airports` | Rebuild `src/data/airports.json` (OurAirports + mwgg) |
| `npm run fixtures:record` | Record live provider responses for tests |

## Providers & attribution

- **Google Flights** public results page — free, unofficial, no key.
- **SerpApi** free plan (250 searches/month) for hotels and activities.
  Optional: without `SERPAPI_API_KEY` those searches stay disabled and manual
  entry is used. Set it in `.env.local`; see Settings → Data providers.
- **OpenStreetMap Nominatim** geocoding (© OpenStreetMap contributors,
  ODbL) — 1 req/s, 180-day cache.
- **OSRM / FOSSGIS** routing, **Transitous** transit, **Frankfurter** (ECB)
  FX rates — free, no key.
- Airport data: **OurAirports** (public domain) + **mwgg/Airports** (MIT);
  regenerated into `src/data/airports.json` by `npm run data:airports`.

Recorded provider responses exist only under `tests/fixtures` and replay only
when `PROVIDER_FIXTURES_DIR` is set (never in production).

## Known limitations

- No email verification or password reset (v1 scope).
- The full flow is live: Flights (Google Flights reader), Stay +
  Activities (SerpApi), Getting around (OSRM/FOSSGIS/Transitous),
  Itinerary, Budget, and the trip Log — with manual entry everywhere.
- Invite links are shown once; revocation is manual.
- Login throttling is in-memory (per server process).
