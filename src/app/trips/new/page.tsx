import { AppNav } from '@/components/app-nav';
import { TripWizard } from '@/components/trip-wizard';
import { requireUser } from '@/lib/auth/guards';
import { env } from '@/lib/env';

export default async function NewTripPage() {
  const user = await requireUser('/trips/new');
  return (
    <>
      <AppNav user={user} />
      <main className="mx-auto w-full max-w-3xl flex-1 px-6 py-8">
        <h1 className="mb-6 text-2xl font-bold">Plan a new trip</h1>
        <TripWizard
          homeTimezone={user.homeTimezone}
          defaultCurrency={user.defaultCurrency}
          maxPairs={env.FLIGHT_SCAN_MAX_PAIRS}
        />
      </main>
    </>
  );
}
