import { requireTripRole } from '@/lib/auth/guards';

export default async function ComingSoonPage({
  params,
  title,
}: {
  params: Promise<{ tripId: string }>;
  title: string;
}) {
  const { tripId } = await params;
  await requireTripRole(tripId, 'viewer');
  return (
    <section className="rounded-xl border border-dashed border-neutral-300 bg-white p-10 text-center">
      <h2 className="font-semibold">{title}</h2>
      <p className="mt-2 text-sm text-neutral-500">
        This section arrives in a later build step.
      </p>
    </section>
  );
}
