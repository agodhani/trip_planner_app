import Link from 'next/link';
import { JoinForm } from '@/components/join-form';
import { getCurrentUser } from '@/lib/auth/guards';
import { previewInvite } from '@/lib/services/invites';

export default async function InvitePage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  const invite = await previewInvite(token);
  const user = await getCurrentUser();

  if (invite.status === 'invalid') {
    return (
      <main className="mx-auto flex max-w-md flex-1 flex-col items-center justify-center gap-4 px-6 py-24 text-center">
        <h1 className="text-xl font-semibold">Invite unavailable</h1>
        <p className="text-sm text-neutral-600">
          This invite link is invalid, has been revoked, or has expired. Ask
          the trip owner for a fresh link.
        </p>
        <Link href="/trips" className="text-sm font-medium text-teal-700 hover:underline">
          Go to your trips
        </Link>
      </main>
    );
  }

  const next = `/invite/${token}`;

  return (
    <main className="mx-auto flex max-w-md flex-1 flex-col items-center justify-center gap-5 px-6 py-24 text-center">
      <h1 className="text-xl font-semibold">
        {invite.inviterName} invited you to
      </h1>
      <p className="text-2xl font-bold text-teal-700">{invite.tripName}</p>
      <p className="text-sm text-neutral-600">
        You will join as {invite.role === 'editor' ? 'an editor' : 'a viewer'}.
      </p>
      {user ? (
        <JoinForm token={token} tripName={invite.tripName} />
      ) : (
        <div className="flex gap-3">
          <Link
            href={`/signup?next=${encodeURIComponent(next)}`}
            className="rounded-lg bg-teal-600 px-5 py-2.5 font-medium text-white hover:bg-teal-700"
          >
            Sign up to join
          </Link>
          <Link
            href={`/login?next=${encodeURIComponent(next)}`}
            className="rounded-lg border border-neutral-300 px-5 py-2.5 font-medium hover:bg-neutral-100"
          >
            Log in to join
          </Link>
        </div>
      )}
    </main>
  );
}
