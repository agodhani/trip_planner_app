<!-- BEGIN:nextjs-agent-rules -->

## This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

# TripPlanner

Collaborative trip planner. Next.js 16 (App Router, `src/`, `@/*` alias) + Postgres.

## Hard product rules

- **No mock or fake data in the product.** Everything shown comes from live
  providers or user input. Provider failure ⇒ clear notice + manual entry,
  never placeholder results. Recorded fixtures are test-only
  (`PROVIDER_FIXTURES_DIR`, which must throw if set in production).
- **No LLM anywhere.** Search refinement is rule-based filtering.
- **Free data only:** Google Flights public page (unofficial, no key), SerpApi
  free plan (optional key), OSM Nominatim, OSRM/FOSSGIS, Transitous,
  Frankfurter, public airport datasets.
- **Exact dependency pins** (no `^`/`~`). Every direct dependency must have
  been published on or before 2026-10-23 (check `npm view <pkg> time`).
- **Ports:** dev server 3030, Playwright 3100, Postgres 5434.

## Commands

```bash
docker compose up -d        # Postgres on :5434 (+ tripplanner_test db)
npm run dev                 # dev server on :3030
npm run build && npm start  # prod build, port 3030
npm run lint                # eslint .
npm run typecheck           # tsc --noEmit
npm test                    # vitest (tests/unit)
npm run test:e2e            # playwright (tests/e2e, test DB, fixture replay)
npm run db:generate         # drizzle-kit generate -> drizzle/
npm run db:migrate          # tsx scripts/migrate.ts (DATABASE_URL)
npm run data:airports       # rebuild src/data/airports.json (committed)
npm run fixtures:record   # record live Nominatim + Google Flights responses into tests/fixtures
npm run smoke:flights     # live Google Flights reader check: npm run smoke:flights -- JFK LIS 2026-12-04 2026-12-07
```

## Layout

- `src/lib/env.ts` — zod-validated env, server-only.
- `src/lib/db/` — `client.ts` (postgres.js + drizzle, global dev client),
  `schema.ts` (all tables; migrate via `npm run db:generate && db:migrate`).
- `src/lib/auth/` — scrypt passwords, sha256 session tokens in `tp_session`
  cookie, guards (`requireUser`, `requireTripRole`), in-memory login rate limit.
- `src/lib/domain/` — pure logic, no I/O, unit-tested (e.g. `dates/strategy.ts`).
- `src/lib/services/` — business logic + permission checks. Every trip
  mutation runs in a transaction that calls `recordEvent` (which also bumps
  `trips.version` for polling).
- `src/lib/providers/` — adapters. `providerFetch` (timeout + ProviderError +
  fixture replay/record), `cachedCall` (provider_cache + provider_calls),
  `airports.ts`, `osm/nominatim.ts` (1 req/s, 180-day cache), `serpapi/`.
- `src/lib/actions/` — Server Actions (zod-validated). Route handlers are GET
  JSON only (`/api/places`, `/api/trips/[tripId]/version`).
- `src/components/` — client components (wizard, place picker, tabs, controls).
- `src/data/airports.json` — generated, committed.
- `scripts/`, `drizzle/`, `tests/{unit,e2e,fixtures}`, `docker/`.

## Conventions

- `import 'server-only'` in env/db/auth/providers/services modules.
- `params`, `searchParams`, `cookies()`, `headers()` are async. No
  `middleware.ts`/`proxy.ts`. Do not enable `cacheComponents`.
- Roles: owner > editor > viewer. Non-members get 404 on trip routes; a short
  role throws `ForbiddenError` rendered by the trip error boundary.
- Money: integer cents in domain code, `numeric(12,2)` in the DB.
- Times: Luxon; flight times stored as local ISO + IANA tz.
- Tailwind v4, neutral palette + teal accent, lucide-react icons, no emojis in
  UI text.
- Invite links: 32-byte tokens, only the sha256 is stored; URL shown once.
- E2E uses `tests/fixtures` replay (never network) and a truncated
  `tripplanner_test` DB; record fixtures with `npm run fixtures:record`.
  Playwright's expect timeout is 15s because cold `next dev` compiles under
  default-worker parallelism exceed 5s.

## UI conventions

- Display money/dates through `src/lib/ui-format.ts` (`money`, `dayLabel`,
  `dateRange`, `plural`) — never raw ISO dates or `USD 12` strings in UI.
- Form submits use `SubmitButton` (spinner + disabled while pending, stable
  label). Server Actions parse with `formFields(formData)` so a blank
  optional input means "absent", not `0`.
- Result lists are comparison tables: sortable headers, click a row to
  expand details, horizontal row actions, and a persistent "Shortlisted"
  state derived from option `externalId` (shared key, e.g. `flightKey`).
  `addOption` is idempotent on that key.
- Option mutations revalidate the whole trip layout
  (`revalidatePath(`/trips/${id}`, 'layout')`): tab badges and the Overview
  checklist (`tripProgress`) depend on them.
- Order itinerary items with `orderDay()` everywhere they are listed or
  paired (itinerary, routes, log) so all views agree.
- Explain non-obvious numbers inline (scores, "from" prices, estimates)
  rather than in tooltips only.
- Flight emissions/legroom/layover flags are per leg (`FlightLeg.emissionsKg`,
  `typicalEmissionsKg`); format with `emissionsInfo`/`layoverFlags`/
  `legroomLabel` in `domain/flight-rows.ts`.
- Opening hours: Google Maps `operating_hours` saved on activity options
  (`data.hours`) go through `domain/opening-hours.ts`. Unknown or unparseable
  hours never warn; holiday notes are stripped (they describe the fetch week).
- Expense splits (equal / exact / shares) go through `planSplit` in
  `domain/money.ts`; base-currency shares always sum exactly to the expense
  (`weightedSplit`, largest remainder). Payer and split members must be
  travelers on the trip.
- Stay scores: `score` is the displayed, clamped 0–100; sort and "Top pick"
  use `rawScore` so clamped ties stay ordered.

## Testing convention (user requirement)

- **Every feature ships with tests.** New domain logic gets unit tests in
  `tests/unit` (vitest); new user-facing flows get a Playwright spec in
  `tests/e2e`. Bug fixes get a regression test that fails before the fix.
- Keep the whole suite green when changing existing code — it is the
  regression net. Before calling work done run: `npm run lint`,
  `npm run typecheck`, `npm test`, `npm run build`, `npm run test:e2e`.
- Provider-touching e2e paths need recorded fixtures under `tests/fixtures`
  (`npm run fixtures:record`, or a `default.json` fallback per
  provider/operation). Never hit the live network in tests.
