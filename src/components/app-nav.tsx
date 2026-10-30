import Link from 'next/link';
import { logout } from '@/lib/actions/auth';
import type { SessionUser } from '@/lib/auth/session';

export function AppNav({ user }: { user: SessionUser }) {
  return (
    <header className="border-b border-neutral-200 bg-white">
      <div className="mx-auto flex max-w-5xl items-center justify-between px-6 py-3">
        <Link href="/trips" className="text-lg font-bold text-teal-700">
          TripPlanner
        </Link>
        <nav className="flex items-center gap-4 text-sm">
          <Link href="/trips" className="text-neutral-700 hover:text-teal-700">
            Trips
          </Link>
          <Link
            href="/settings"
            className="text-neutral-700 hover:text-teal-700"
          >
            Settings
          </Link>
          <span className="text-neutral-500">{user.name}</span>
          <form action={logout}>
            <button
              type="submit"
              className="rounded-md border border-neutral-300 px-3 py-1 text-neutral-700 hover:bg-neutral-100"
            >
              Log out
            </button>
          </form>
        </nav>
      </div>
    </header>
  );
}
