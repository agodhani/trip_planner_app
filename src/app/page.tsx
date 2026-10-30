import Link from 'next/link';
import { redirect } from 'next/navigation';
import { getCurrentUser } from '@/lib/auth/guards';

export default async function Home() {
  const user = await getCurrentUser();
  if (user) redirect('/trips');
  return (
    <main className="mx-auto flex max-w-2xl flex-1 flex-col items-center justify-center gap-6 px-6 py-24 text-center">
      <h1 className="text-4xl font-bold tracking-tight">TripPlanner</h1>
      <p className="text-lg text-neutral-600">
        Plan trips together — pick a destination, compare real flight dates,
        and organize everything in one place.
      </p>
      <div className="flex gap-3">
        <Link
          href="/login"
          className="rounded-lg border border-neutral-300 px-5 py-2.5 font-medium hover:bg-neutral-100"
        >
          Log in
        </Link>
        <Link
          href="/signup"
          className="rounded-lg bg-teal-600 px-5 py-2.5 font-medium text-white hover:bg-teal-700"
        >
          Sign up
        </Link>
      </div>
    </main>
  );
}
