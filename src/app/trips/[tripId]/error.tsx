'use client';

import Link from 'next/link';

export default function TripError({ error }: { error: Error }) {
  return (
    <main className="mx-auto flex max-w-lg flex-1 flex-col items-center justify-center gap-4 px-6 py-24 text-center">
      <h1 className="text-xl font-semibold">Access denied</h1>
      <p className="text-sm text-neutral-600">{error.message}</p>
      <Link href="/trips" className="text-sm font-medium text-teal-700 hover:underline">
        Back to your trips
      </Link>
    </main>
  );
}
