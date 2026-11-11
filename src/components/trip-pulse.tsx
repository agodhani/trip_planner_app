'use client';

import { usePathname, useRouter } from 'next/navigation';
import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { tripPulseAction } from '@/lib/actions/pulse';
import {
  collapseEvents,
  eventTab,
  presenceState,
  type PulseTab,
} from '@/lib/domain/activity-feed';
import { timeAgo } from '@/lib/ui-format';
import { ToastProvider, useToast } from '@/components/toaster';

const DEFAULT_POLL_MS = 15_000;
// e2e sets NEXT_PUBLIC_PULSE_MS=1000; anything unset/bogus/tiny falls back.
const POLL_MS = (() => {
  const n = Number(process.env.NEXT_PUBLIC_PULSE_MS);
  return Number.isFinite(n) && n >= 250 ? n : DEFAULT_POLL_MS;
})();

type PulseContextValue = {
  /** userId → lastSeenAt ISO (null = never pulsed). */
  presence: ReadonlyMap<string, string | null>;
  /** Client clock when presence last refreshed — keeps render pure. */
  presenceAt: number;
  /** Tabs with unseen change events. */
  unseenTabs: ReadonlySet<string>;
};

const TripPulseContext = createContext<PulseContextValue>({
  presence: new Map(),
  presenceAt: 0,
  unseenTabs: new Set(),
});

export function useTripPulse(): PulseContextValue {
  return useContext(TripPulseContext);
}

const ROUTE_TABS: ReadonlySet<string> = new Set([
  'today', 'flights', 'stay', 'activities', 'transport', 'itinerary',
  'budget', 'log', 'recap', 'shortlist', 'people',
]);

/** '/trips/x/activities' → 'activities'; '/trips/x' → 'overview'. */
function tabFromPath(pathname: string, tripId: string): PulseTab {
  const base = `/trips/${tripId}`;
  const seg = pathname.startsWith(`${base}/`)
    ? pathname.slice(base.length + 1).split('/')[0]
    : '';
  return (ROUTE_TABS.has(seg) ? seg : 'overview') as PulseTab;
}

function storageKey(tripId: string) {
  return `pulse:${tripId}`;
}

/**
 * Per-tab unseen markers live in sessionStorage as {tab: lastUnseenEventId}
 * so a dot survives a reload. Storage is the source of truth; React state
 * only mirrors it (initially empty so hydration matches the server).
 */
function readUnseen(tripId: string): Record<string, number> {
  try {
    const raw = window.sessionStorage.getItem(storageKey(tripId));
    const parsed: unknown = raw ? JSON.parse(raw) : {};
    if (!parsed || typeof parsed !== 'object') return {};
    const out: Record<string, number> = {};
    for (const [k, v] of Object.entries(parsed)) {
      if (typeof v === 'number') out[k] = v;
    }
    return out;
  } catch {
    return {};
  }
}

function writeUnseen(tripId: string, map: Record<string, number>) {
  try {
    if (Object.keys(map).length) {
      window.sessionStorage.setItem(storageKey(tripId), JSON.stringify(map));
    } else {
      window.sessionStorage.removeItem(storageKey(tripId));
    }
  } catch {
    // Storage unavailable (private mode) — dots degrade to in-memory.
  }
}

export function TripPulse({
  tripId,
  version,
  userId,
  initialEventId,
  children,
}: {
  tripId: string;
  version: number;
  userId: string;
  /** Max activity_events.id at render — we never toast history. */
  initialEventId: number;
  children: ReactNode;
}) {
  return (
    <ToastProvider>
      <PulseRunner
        tripId={tripId}
        version={version}
        userId={userId}
        initialEventId={initialEventId}
      >
        {children}
      </PulseRunner>
    </ToastProvider>
  );
}

function PulseRunner({
  tripId,
  version,
  userId,
  initialEventId,
  children,
}: {
  tripId: string;
  version: number;
  userId: string;
  initialEventId: number;
  children: ReactNode;
}) {
  const router = useRouter();
  const pathname = usePathname();
  // push/dismiss are stable callbacks — depending on them (not the context
  // object, which re-creates per provider render) keeps the interval steady.
  const { push: pushToast } = useToast();
  const [presence, setPresence] = useState<{
    at: number;
    map: Map<string, string | null>;
  }>({ at: 0, map: new Map() });
  const [unseen, setUnseen] = useState<Record<string, number>>({});
  const seenVersion = useRef(version);
  const cursor = useRef(initialEventId);

  useEffect(() => {
    seenVersion.current = version;
  }, [version]);

  // On mount and every navigation: reload the stored dots and clear the one
  // for the tab being viewed — storage is mirrored into state, the same
  // pattern as the results-cache restore in activities-client.
  useEffect(() => {
    const next = readUnseen(tripId);
    const tab = tabFromPath(pathname, tripId);
    if (tab in next) {
      delete next[tab];
      writeUnseen(tripId, next);
    }
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setUnseen(next);
  }, [pathname, tripId]);

  useEffect(() => {
    let dead = false;
    const id = setInterval(async () => {
      if (document.visibilityState !== 'visible') return;
      try {
        const res = await tripPulseAction({
          tripId,
          sinceEventId: cursor.current,
          currentTab: tabFromPath(window.location.pathname, tripId),
        });
        if (dead) return;

        setPresence({
          at: Date.now(),
          map: new Map(res.viewers.map((v) => [v.userId, v.lastSeenAt])),
        });

        if (res.version !== seenVersion.current) {
          seenVersion.current = res.version;
          router.refresh();
        }
        if (!res.events.length) return;
        // Advance the cursor past everything we were shown, self-authored
        // included, so nothing toasts twice.
        cursor.current = Math.max(
          cursor.current,
          ...res.events.map((e) => e.id),
        );
        const fresh = res.events.filter((e) => e.actorId !== userId);
        if (!fresh.length) return;

        // Unseen dots: every other-user event counts — including verbs that
        // are toast-suppressed — because the tab's content really changed.
        // The tab you're looking at never gets a dot.
        const here = tabFromPath(window.location.pathname, tripId);
        const merged = readUnseen(tripId);
        let changed = false;
        for (const e of fresh) {
          const tab = eventTab(e.verb, e.optionKind);
          if (tab && tab !== here && e.id > (merged[tab] ?? 0)) {
            merged[tab] = e.id;
            changed = true;
          }
        }
        if (changed) {
          writeUnseen(tripId, merged);
          setUnseen(merged);
        }

        // One toast per collapsed event; unmapped verbs get no View jump.
        for (const item of collapseEvents(res.events, userId)) {
          const tab = item.tab;
          pushToast(
            item.text,
            tab
              ? {
                  actionLabel: 'View',
                  onAction: () =>
                    router.push(
                      `/trips/${tripId}${tab === 'overview' ? '' : `/${tab}`}`,
                    ),
                }
              : undefined,
          );
        }
      } catch {
        // Transient poll failure (offline, session expired); next tick retries.
      }
    }, POLL_MS);
    return () => {
      dead = true;
      clearInterval(id);
    };
  }, [tripId, userId, router, pushToast]);

  const ctx = useMemo<PulseContextValue>(
    () => ({
      presence: presence.map,
      presenceAt: presence.at,
      unseenTabs: new Set(Object.keys(unseen)),
    }),
    [presence, unseen],
  );

  return (
    <TripPulseContext.Provider value={ctx}>
      {children}
    </TripPulseContext.Provider>
  );
}

/**
 * The member avatar strip with presence: teal dot while a member's heartbeat
 * is fresh, "last seen …" once it goes stale.
 */
export function MemberAvatars({
  members,
}: {
  members: { userId: string; name: string; role: string }[];
}) {
  const { presence, presenceAt } = useTripPulse();
  return (
    <div className="ml-auto flex -space-x-2" data-no-print>
      {members.map((m) => {
        const seen = presence.get(m.userId) ?? null;
        const state = presenceState(seen, presenceAt);
        const title =
          state === 'here'
            ? `${m.name} — viewing now`
            : state === 'away' && seen
              ? `${m.name} — last seen ${timeAgo(seen, presenceAt)}`
              : `${m.name} (${m.role})`;
        return (
          <span
            key={m.userId}
            title={title}
            className="relative flex h-8 w-8 items-center justify-center rounded-full border-2 border-white bg-teal-600 text-xs font-semibold text-white"
          >
            {m.name.slice(0, 1).toUpperCase()}
            {state === 'here' && (
              <span
                data-testid="presence-dot"
                aria-hidden
                className="absolute -bottom-0.5 -right-0.5 h-2.5 w-2.5 rounded-full border border-white bg-teal-300"
              />
            )}
          </span>
        );
      })}
    </div>
  );
}
