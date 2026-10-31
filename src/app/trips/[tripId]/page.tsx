import Link from 'next/link';
import { Circle } from 'lucide-react';
import { CommentForm } from '@/components/comment-form';
import { requireTripRole } from '@/lib/auth/guards';
import { formatDateTime } from '@/lib/format';
import { listActivity, listTripComments } from '@/lib/services/comments';

const FLOW = [
  {
    slug: 'flights',
    title: 'Flights',
    hint: 'Search real fares for your date strategy',
  },
  { slug: 'stay', title: 'Stay', hint: 'Find hotels and rentals' },
  { slug: 'activities', title: 'Activities', hint: 'Things to do' },
  {
    slug: 'transport',
    title: 'Getting around',
    hint: 'Airport transfers and local transport',
  },
  { slug: 'itinerary', title: 'Itinerary', hint: 'Day-by-day plan' },
];

export default async function TripOverviewPage({
  params,
}: {
  params: Promise<{ tripId: string }>;
}) {
  const { tripId } = await params;
  const { user } = await requireTripRole(tripId, 'viewer');
  const [comments, activity] = await Promise.all([
    listTripComments(tripId),
    listActivity(tripId),
  ]);

  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_320px]">
      <div className="flex flex-col gap-6">
        <section className="rounded-xl border border-neutral-200 bg-white p-5 shadow-sm">
          <h2 className="mb-3 font-semibold">Planning checklist</h2>
          <ol className="flex flex-col gap-2">
            {FLOW.map((step) => (
              <li key={step.slug}>
                <Link
                  href={`/trips/${tripId}/${step.slug}`}
                  className="flex items-center gap-3 rounded-lg border border-neutral-200 px-3 py-2 hover:border-teal-400"
                >
                  <Circle className="h-4 w-4 text-neutral-300" />
                  <span>
                    <span className="block text-sm font-medium">{step.title}</span>
                    <span className="block text-xs text-neutral-500">
                      {step.hint}
                    </span>
                  </span>
                </Link>
              </li>
            ))}
          </ol>
        </section>

        <section className="rounded-xl border border-neutral-200 bg-white p-5 shadow-sm">
          <h2 className="mb-3 font-semibold">Discussion</h2>
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

