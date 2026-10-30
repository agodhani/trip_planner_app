import {
  AddTravelerForm,
  InviteCreateForm,
  MemberControls,
  RenameTravelerForm,
  RevokeInviteButton,
} from '@/components/people-controls';
import { requireTripRole } from '@/lib/auth/guards';
import { listInvites } from '@/lib/services/invites';
import { listMembers } from '@/lib/services/members';
import { listTravelers } from '@/lib/services/travelers';

const cardCls = 'rounded-xl border border-neutral-200 bg-white p-5 shadow-sm';

export default async function PeoplePage({
  params,
}: {
  params: Promise<{ tripId: string }>;
}) {
  const { tripId } = await params;
  const { user, role } = await requireTripRole(tripId, 'viewer');
  const isOwner = role === 'owner';
  const [members, travelers, invites] = await Promise.all([
    listMembers(tripId),
    listTravelers(tripId),
    isOwner ? listInvites(tripId) : Promise.resolve([]),
  ]);

  const memberNames = new Map(members.map((m) => [m.userId, m.name]));

  return (
    <div className="grid gap-6 lg:grid-cols-2">
      <section className={cardCls}>
        <h2 className="mb-3 font-semibold">Members</h2>
        <ul className="flex flex-col gap-3">
          {members.map((m) => (
            <li
              key={m.userId}
              className="flex items-center justify-between gap-3"
            >
              <div>
                <p className="text-sm font-medium">
                  {m.name}
                  {m.userId === user.id && (
                    <span className="ml-1 text-xs text-neutral-500">(you)</span>
                  )}
                </p>
                <p className="text-xs text-neutral-500">
                  {m.email} · {m.role}
                </p>
              </div>
              {isOwner && m.role !== 'owner' && (
                <MemberControls
                  tripId={tripId}
                  userId={m.userId}
                  role={m.role as 'editor' | 'viewer'}
                  isOwnerRow={false}
                />
              )}
            </li>
          ))}
        </ul>
      </section>

      <section className={cardCls}>
        <h2 className="mb-3 font-semibold">Invite links</h2>
        {isOwner ? (
          <>
            <InviteCreateForm tripId={tripId} />
            {invites.length === 0 ? (
              <p className="mt-3 text-sm text-neutral-500">
                No active invite links.
              </p>
            ) : (
              <ul className="mt-4 flex flex-col gap-2">
                {invites.map((i) => (
                  <li
                    key={i.id}
                    className="flex items-center justify-between gap-2 text-sm"
                  >
                    <span>
                      {i.role} · expires {i.expiresAt.toLocaleDateString()} ·{' '}
                      {i.uses} use{i.uses === 1 ? '' : 's'}
                    </span>
                    <RevokeInviteButton tripId={tripId} inviteId={i.id} />
                  </li>
                ))}
              </ul>
            )}
          </>
        ) : (
          <p className="text-sm text-neutral-500">
            Only the trip owner manages invite links.
          </p>
        )}
      </section>

      <section className={cardCls}>
        <h2 className="mb-3 font-semibold">Travelers</h2>
        <p className="mb-3 text-xs text-neutral-500">
          Travelers share costs on this trip. Account members are travelers too.
        </p>
        {isOwner && (
          <div className="mb-4">
            <AddTravelerForm tripId={tripId} />
          </div>
        )}
        <ul className="flex flex-col gap-2">
          {travelers.map((t) => (
            <li
              key={t.id}
              className="flex items-center justify-between gap-2 text-sm"
            >
              <span>
                {t.displayName}
                {t.userId && memberNames.has(t.userId) && (
                  <span className="ml-1 text-xs text-neutral-500">(member)</span>
                )}
              </span>
              {isOwner && (
                <RenameTravelerForm
                  tripId={tripId}
                  travelerId={t.id}
                  current={t.displayName}
                />
              )}
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
