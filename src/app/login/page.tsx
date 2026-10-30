import Link from 'next/link';
import { redirect } from 'next/navigation';
import { LoginForm } from '@/components/auth-forms';
import { getCurrentUser, safeNextPath } from '@/lib/auth/guards';

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string }>;
}) {
  const user = await getCurrentUser();
  const { next } = await searchParams;
  const safe = safeNextPath(next) ?? undefined;
  if (user) redirect(safe ?? '/trips');
  return (
    <main className="mx-auto flex w-full max-w-sm flex-1 flex-col justify-center gap-6 px-6 py-16">
      <h1 className="text-2xl font-bold">Log in</h1>
      <LoginForm next={safe} />
      <p className="text-sm text-neutral-600">
        No account yet?{' '}
        <Link
          href={safe ? `/signup?next=${encodeURIComponent(safe)}` : '/signup'}
          className="font-medium text-teal-700 hover:underline"
        >
          Sign up
        </Link>
      </p>
    </main>
  );
}
