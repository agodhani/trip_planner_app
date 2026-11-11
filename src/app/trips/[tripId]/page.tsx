import Link from 'next/link';
import { ArrowRight, CheckCircle2, Circle, CircleDot } from 'lucide-react';
import { CommentForm } from '@/components/comment-form';
import { requireTripRole } from '@/lib/auth/guards';
import { todayISO } from '@/lib/clock';
import type { StepKey, StepState } from '@/lib/domain/progress';
import { safeZone, tripLive, tripPhase } from '@/lib/domain/today';
import { formatDateTime } from '@/lib/format';
import { listActivity, listTripComments } from '@/lib/services/comments';
import { tripDays } from '@/lib/services/itinerary';
import { tripProgress } from '@/lib/services/progress';
import { getTrip } from '@/lib/services/trips';
import { notFound } from 'next/navigation';

const STEP: Record<StepKey, { title: string; slug: string; cta: string }> = {
  flights: { title: 'Flights', slug: 'flights', cta: 'Find flights' },
  stay: { title: 'Stay', slug: 'stay', cta: 'Find a place to stay' },
  activities: { title: 'Activities', slug: 'activities', cta: 'Browse things to do' },
  itinerary: { title: 'Itinerary', slug: 'itinerary', cta: 'Plan your days' },
  transport: { title: 'Getting around', slug: 'transport', cta: 'Plan routes' },
  budget: { title: 'Budget', slug: 'budget', cta: 'Track spending' },
};

function StateIcon({ state }: { state: StepState }) {
  if (state === 'done') return <CheckCircle2 aria-label="done" className="h-5 w-5 shrink-0 text-teal-600" />;
  if (state === 'started') return <CircleDot aria-label="in progress" className="h-5 w-5 shrink-0 text-amber-500" />;
  return <Circle aria-label="not started" className="h-5 w-5 shrink-0 text-neutral-300" />;
}

export default async function TripOverviewPage({
  params,
}: {
  params: Promise<{ tripId: string }>;
}) {
  const { tripId } = await params;
  const { user } = await requireTripRole(tripId, 'viewer');
  const trip = await getTrip(tripId);
  if (!trip) notFound();
  const [comments, activity, progress] = await Promise.all([
    listTripComments(tripId),
    listActivity(tripId),
    tripProgress(trip),
  ]);
  const next = progress.next ? progress.steps.find((s) => s.key === progress.next)! : null;
  const doneCount = progress.steps.filter((s) => s.state === 'done').length;
  // Same window as the Today tab: destination-local today inside the trip
  // window, or a trip marked in_progress.
  const live = tripLive(
    trip.status,
    tripPhase(tripDays(trip), todayISO(safeZone(trip.destination.timezone))),
  );

  return (
    // minmax(0,…) caps tracks at the container width — a plain `1fr`/`auto`
    // track would grow to an item's max-content (nowrap checklist text) and
    // push the page past the viewport on mobile.
    <div className="grid grid-cols-[minmax(0,1fr)] gap-6 lg:grid-cols-[minmax(0,1fr)_320px]">
      <div className="flex flex-col gap-6">
        {live && (
          <Link
            href={`/trips/${tripId}/today`}
            className="flex items-center justify-between gap-3 rounded-xl bg-teal-600 px-4 py-3 text-white shadow-sm hover:bg-teal-700"
          >
            <span>
              <span className="block text-xs font-medium uppercase tracking-wide text-teal-100">Trip is live</span>
              <span className="block font-semibold">Open Today — the running plan for right now</span>
            </span>
            <span className="flex items-center gap-1 font-medium">
              Open Today <ArrowRight aria-hidden className="h-4 w-4" />
            </span>
          </Link>
        )}
        <section className="rounded-xl border border-neutral-200 bg-white p-5 shadow-sm">
          <div className="mb-3 flex items-baseline justify-between gap-2">
            <h2 className="font-semibold">Planning checklist</h2>
            <span className="text-xs text-neutral-500">{doneCount} of {progress.steps.length} done</span>
          </div>

          {next ? (
            <Link
              href={`/trips/${tripId}/${STEP[next.key].slug}`}
              className="mb-4 flex items-center justify-between gap-3 rounded-lg bg-teal-600 px-4 py-3 text-white hover:bg-teal-700"
            >
              <span>
                <span className="block text-xs font-medium uppercase tracking-wide text-teal-100">Next step</span>
                <span className="block font-semibold">{STEP[next.key].cta}</span>
                <span className="block text-sm text-teal-50">{next.summary}</span>
              </span>
              <ArrowRight aria-hidden className="h-5 w-5 shrink-0" />
            </Link>
          ) : (
            <p className="mb-4 rounded-lg bg-teal-50 px-4 py-3 text-sm text-teal-800">
              The essentials are planned. Keep refining the itinerary, and log expenses as you go.
            </p>
          )}

          <ol className="flex flex-col gap-2">
            {progress.steps.map((step) => (
              <li key={step.key}>
                <Link
                  href={`/trips/${tripId}/${STEP[step.key].slug}`}
                  className={`flex items-center gap-3 rounded-lg border px-3 py-2.5 hover:border-teal-400 ${
                    step.key === progress.next ? 'border-teal-300 bg-teal-50/40' : 'border-neutral-200'
                  }`}
                >
                  <StateIcon state={step.state} />
                  <span className="min-w-0 flex-1">
                    <span className="block text-sm font-medium">{STEP[step.key].title}</span>
                    <span className="block truncate text-xs text-neutral-600">{step.summary}</span>
                  </span>
                  <ArrowRight aria-hidden className="h-4 w-4 shrink-0 text-neutral-400" />
                </Link>
              </li>
            ))}
          </ol>
        </section>

        <section className="rounded-xl border border-neutral-200 bg-white p-5 shadow-sm">
          <h2 className="mb-1 font-semibold">Discussion</h2>
          <p className="mb-3 text-xs text-neutral-500">Everyone on the trip sees these messages.</p>
          <CommentForm tripId={tripId} />
          {comments.length === 0 ? (
            <p className="mt-3 text-sm text-neutral-500">No comments yet.</p>
          ) : (
            <ul className="mt-4 flex flex-col gap-3">
              {comments.map((c) => (
                <li
                  key={c.id}
                  className="rounded-lg bg-neutral-50 px-3 py-2 text-sm"
                >
                  <div className="mb-0.5 flex items-baseline gap-2">
                    <span className="font-medium">{c.authorName}</span>
                    <time className="text-xs text-neutral-500">
                      {formatDateTime(c.createdAt, user.homeTimezone)}
                    </time>
                  </div>
                  <p className="whitespace-pre-wrap">{c.body}</p>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>

      <aside className="rounded-xl border border-neutral-200 bg-white p-5 shadow-sm">
        <h2 className="mb-3 font-semibold">Activity</h2>
        {activity.length === 0 ? (
          <p className="text-sm text-neutral-500">Nothing yet.</p>
        ) : (
          <ul className="flex flex-col gap-2">
            {activity.map((e) => (
              <li key={e.id} className="text-sm">
                <p>{e.summary}</p>
                <time className="text-xs text-neutral-500">
                  {formatDateTime(e.createdAt, user.homeTimezone)}
                </time>
              </li>
            ))}
          </ul>
        )}
      </aside>
    </div>
  );
}
