import Link from 'next/link';
import { redirect } from 'next/navigation';
import { SignupForm } from '@/components/auth-forms';
import { getCurrentUser, safeNextPath } from '@/lib/auth/guards';

export default async function SignupPage({
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
      <h1 className="text-2xl font-bold">Create your account</h1>
      <SignupForm next={safe} />
      <p className="text-sm text-neutral-600">
        Already have an account?{' '}
        <Link
          href={safe ? `/login?next=${encodeURIComponent(safe)}` : '/login'}
          className="font-medium text-teal-700 hover:underline"
        >
          Log in
        </Link>
      </p>
    </main>
  );
}
