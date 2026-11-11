# TripPlanner — what's in each version

A collaborative trip planner: plan → travel → recap. Live provider data or
explicit user input only — never fabricated results, never an LLM. Every
feature below ships with unit and/or Playwright coverage.

## Foundation (initial builds)

- Accounts (scrypt passwords, session cookies), trips with origin/destination,
  traveler counts, and date strategies: exact dates, ±days flexibility, and
  "cheapest weekend of the month" with time-of-day constraints.
- Flights from the Google Flights public page: date-pair cards, outbound →
  return two-step picking, airline names, manual entry on provider failure.
- Stays & activities via SerpApi/OSM: sortable comparison tables, photos,
  scores explained inline, manual entry always available.
- Itinerary: day-by-day items, times, costs; Getting around: OSRM/Transitous
  legs between items.
- Budget & log: expenses with FX conversion (Frankfurter), splits, settle-up;
  per-item outcomes, ratings, journal entries.
- Collaboration: invite links (hashed tokens, owner/editor/viewer roles),
  votes, comments, select/book states, activity history.
- Kayak-style comparison tables; consolidated Shortlist tab; broad UI/UX
  overhaul; emissions/legroom/layover details, opening-hours warnings,
  stays ranked near shortlisted activities, flexible expense splits.
- Fixed: app broken at 127.0.0.1 (dev-origin trust), flight date-pair
  switching crashes.

## Session 1 (`730b072`) — Itinerary Day Board

Board view: drag items between days, unscheduled tray, undo toasts, print
stylesheet. Fixed ~9 audit bugs (dead Print button, confusing controls).

## Session 2 (`4c2206b`) — Compare mode

Side-by-side decision sheets for up to 3 same-kind shortlisted options on
every shortlist surface. Saved data only (no new provider calls), missing
values shown honestly as "—", best-value marks, vote/select/book inline.

## Session 3 (`6b2f108`) — Route-aware day board

Legs auto-sync between located neighbors after drags (debounced, silent for
unlocated items, events only on real change). Per-day collapsible maps and
tight-timing warnings.

## Session 4 (`952166b`) — Trip Pulse

Presence dots (who's viewing now), change toasts ("Sam shortlisted X ·
Flights") with View jumps, per-tab unseen dots. Replaces silent refresh.

## Session 5 (`410dda3`) — Today travel mode

During-trip view: Now/Next/gap hints, one-tap Done outcomes, offline queue,
conditional tab. Fixed `tripDays` so in-progress exact-date trips keep
their days. Unscheduled column moved first for mobile.

## Session 6 (`5e31a4a`) — Trip Recap + data-loss fix

Read-only recap page (ratings, spending, journal, skipped items) shown only
when a story exists. Fixed selecting a one-way flight collapsing the trip
window (orphaned later days); mobile table overflow fixes.

## Session 7 (`7b472fd`) — Public share links

Owner-only, revocable read-only itinerary links — no signup needed for
family/friends. Strict field allowlist (no expenses/votes/emails), noindex.

## Session 8 (`e9a09f5`) — Group date availability

Each member marks works/maybe/can't per flexible date pair; honest counts
vs total members, best-for-group badge, non-blocking select warnings.

## Session 9 (`fcfa48a`) — Budget caps + booked→spent bridge

Trip budget + per-category caps with bars; booking an option can log the
actually-paid amount as an expense (opt-out), so committed vs spent is
honest. No-cap state shows no fake precision.

## Session 10 (`7b707d4`) — "Who's on it" trip tasks

Assignable, due-dated tasks grouped by assignee; editors manage all,
members toggle tasks linked to their traveler; activity events + pulse.

## Session 11 (`b09ff8e`) — Trash & Undo

Removing an option is now a soft delete: votes/comments/links preserved,
hidden via a shared `optionIsActive` predicate. Undo toast, Recently
removed bin (who/when), Restore, two-step Delete forever. Re-shortlisting
a binned result restores the same row; restore demotes on one-pick
conflict; itinerary items show a "removed" marker instead of vanishing.

## Session 12 (`f60394b`) — Price Watch + currency fix

"Check prices" re-queries Google Flights for shortlisted flights:
delta chips (−5.9%), "no longer listed", "checked 3h ago" — price drops
toast via Pulse. `option_price_checks` history table; the shortlist-time
price stays the baseline. Fixed budget rollups summing foreign-currency
option prices unconverted (now converted via FX or honestly excluded).

## Still deferred (not built)

- .ics calendar feed, scheduled/background price checks, settlement
  payments in Budget, multi-city trips, dark mode, Cmd+K.
