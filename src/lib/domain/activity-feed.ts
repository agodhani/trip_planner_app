/**
 * Trip pulse feed: maps activity events to trip tabs, folds noisy bursts into
 * a few honest toasts, and derives presence from heartbeats.
 * Pure logic — unit-tested, no I/O.
 */

export type PulseTab =
  | 'today'
  | 'flights'
  | 'stay'
  | 'activities'
  | 'transport'
  | 'itinerary'
  | 'budget'
  | 'log'
  | 'recap'
  | 'shortlist'
  | 'people'
  | 'overview';

export const TAB_LABEL: Record<PulseTab, string> = {
  today: 'Today',
  flights: 'Flights',
  stay: 'Stay',
  activities: 'Activities',
  transport: 'Getting around',
  itinerary: 'Itinerary',
  budget: 'Budget',
  log: 'Log',
  recap: 'Recap',
  shortlist: 'Shortlist',
  people: 'People',
  overview: 'Overview',
};

/** An activity_events row joined with its actor name and (for options) kind. */
export type FeedEvent = {
  id: number;
  verb: string;
  summary: string;
  actorId: string | null;
  actorName: string | null;
  /** trip_options.kind, only when entityType = 'option'. Drives the tab. */
  optionKind?: string | null;
};

/**
 * Which trip tab an event belongs to. null means "no real mapping" — callers
 * must not offer a View jump they cannot honour. 'overview' is a real mapping
 * (the activity feed and trip discussion live there), not a catch-all.
 */
export function eventTab(
  verb: string,
  optionKind?: string | null,
): PulseTab | null {
  const [ns, sub] = verb.split('.', 2);
  switch (ns) {
    case 'option':
      // Options without a dedicated tab (transport/other/missing kind) live
      // on the Shortlist page, so that is where they map.
      switch (optionKind) {
        case 'flight':
          return 'flights';
        case 'lodging':
          return 'stay';
        case 'activity':
          return 'activities';
        default:
          return 'shortlist';
      }
    case 'expense':
      return 'budget';
    case 'itinerary':
      return 'itinerary';
    case 'transport':
      return 'transport';
    case 'flights':
      return 'flights';
    case 'member':
    case 'invite':
    case 'traveler':
      return 'people';
    case 'log':
    case 'journal':
      return 'log';
    case 'trip':
      // Status changes are recorded from the Log page; other trip-level
      // events (created, renamed) describe the trip itself.
      return sub === 'status' ? 'log' : 'overview';
    case 'comment':
      return 'overview';
    default:
      return null;
  }
}

/**
 * Auto-consequence verbs: they echo a user-visible action (drag an item →
 * anchors and legs re-sync underneath) so the UI change arrives via the
 * version bump — toasting them would double-report the same intent. The
 * manual Transport-tab compute button (transport.legs_computed) is real
 * intent and stays loud.
 */
const SUPPRESSED_VERBS = new Set([
  'itinerary.anchors_synced',
  'transport.legs_synced',
]);

export type CollapsedEvent = {
  /** Toast text, already tab-labelled ("Ana shortlisted X · Stay"). */
  text: string;
  /** View jump target; null → text-only toast. */
  tab: PulseTab | null;
  /** Underlying event ids, for cursor bookkeeping and tests. */
  ids: number[];
};

function labelled(e: FeedEvent): Pick<CollapsedEvent, 'text' | 'tab'> {
  const tab = eventTab(e.verb, e.optionKind);
  return { text: tab ? `${e.summary} · ${TAB_LABEL[tab]}` : e.summary, tab };
}

/**
 * Fold a chronologically-ordered event batch into toast-sized items for one
 * viewer:
 *  - the viewer's own events are dropped first (you saw what you did),
 *  - auto-consequence verbs are suppressed,
 *  - consecutive same-actor itinerary.item_moved runs become one
 *    "rearranged the itinerary" note,
 *  - any actor still holding >3 items collapses into
 *    "made N updates" pointing at their most recent tab.
 */
export function collapseEvents(
  events: FeedEvent[],
  viewerId?: string | null,
): CollapsedEvent[] {
  const fresh = events.filter(
    (e) => e.actorId !== viewerId && !SUPPRESSED_VERBS.has(e.verb),
  );

  // Merge consecutive same-actor item_moved events into runs.
  const runs: FeedEvent[][] = [];
  for (const e of fresh) {
    const prev = runs[runs.length - 1];
    if (
      e.verb === 'itinerary.item_moved' &&
      prev &&
      prev[0].verb === 'itinerary.item_moved' &&
      prev[0].actorId === e.actorId
    ) {
      prev.push(e);
    } else {
      runs.push([e]);
    }
  }

  // Actors with >3 surviving items batch into a single summary.
  const counts = new Map<string, number>();
  for (const run of runs) {
    const a = run[0].actorId;
    if (a) counts.set(a, (counts.get(a) ?? 0) + 1);
  }
  const batched = new Set(
    [...counts.entries()].filter(([, n]) => n > 3).map(([a]) => a),
  );

  const out: CollapsedEvent[] = [];
  const emitted = new Set<string>();
  for (const run of runs) {
    const first = run[0];
    const actorId = first.actorId;
    const actorName = first.actorName ?? 'Someone';
    if (actorId && batched.has(actorId)) {
      if (emitted.has(actorId)) continue;
      emitted.add(actorId);
      // N counts the collapsed items — what would otherwise have been shown.
      const items = runs.filter((r) => r[0].actorId === actorId);
      const lastRun = items[items.length - 1];
      const last = lastRun[lastRun.length - 1];
      const tab = eventTab(last.verb, last.optionKind);
      out.push({
        text: `${actorName} made ${items.length} updates${tab ? ` · ${TAB_LABEL[tab]}` : ''}`,
        tab,
        ids: items.flat().map((e) => e.id),
      });
      continue;
    }
    if (run.length > 1 && first.verb === 'itinerary.item_moved') {
      out.push({
        text: `${actorName} rearranged the itinerary · ${TAB_LABEL.itinerary}`,
        tab: 'itinerary',
        ids: run.map((e) => e.id),
      });
      continue;
    }
    out.push({ ...labelled(first), ids: [first.id] });
  }
  return out;
}

/** ~8.5 poll intervals at the default 15s cadence. */
export const PRESENCE_HERE_MS = 130_000;

/**
 * Presence from the last heartbeat: 'here' while it is fresh (~130s covers
 * the 15s poll plus a hidden-tab pause), 'away' once stale, null when the
 * member has never pulsed.
 */
export function presenceState(
  lastSeenAt: Date | string | null | undefined,
  nowMs: number,
): 'here' | 'away' | null {
  if (!lastSeenAt) return null;
  const t =
    typeof lastSeenAt === 'string' ? Date.parse(lastSeenAt) : lastSeenAt.getTime();
  if (Number.isNaN(t)) return null;
  return nowMs - t <= PRESENCE_HERE_MS ? 'here' : 'away';
}
