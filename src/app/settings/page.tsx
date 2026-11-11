import { AppNav } from '@/components/app-nav';
import { ProfileForm } from '@/components/profile-form';
import { requireUser } from '@/lib/auth/guards';
import { getSerpApiAccount } from '@/lib/providers/serpapi/account';
import { GfTestButton } from '@/components/gf-test';

const cardCls = 'rounded-xl border border-neutral-200 bg-white p-5 shadow-sm';

export default async function SettingsPage() {
  const user = await requireUser('/settings');
  const serp = await getSerpApiAccount();

  return (
    <>
      <AppNav user={user} />
      <main className="mx-auto w-full max-w-3xl flex-1 px-6 py-8">
        <h1 className="mb-6 text-2xl font-bold">Settings</h1>
        <div className="grid grid-cols-[minmax(0,1fr)] gap-6 lg:grid-cols-2">
          <section className={cardCls}>
            <h2 className="mb-4 font-semibold">Profile</h2>
            <ProfileForm
              name={user.name}
              homeTimezone={user.homeTimezone}
              defaultCurrency={user.defaultCurrency}
            />
          </section>

          <section className={cardCls}>
            <h2 className="mb-4 font-semibold">Data providers</h2>
            <ul className="flex flex-col gap-4 text-sm">
              <li className="rounded-lg border border-neutral-200 p-3">
                <p className="font-medium">Google Flights</p>
                <p className="text-neutral-600">
                  Free, no key needed. Results are read from the public Google
                  Flights page.
                </p>
                <GfTestButton />
              </li>
              <li className="rounded-lg border border-neutral-200 p-3">
                <p className="font-medium">SerpApi</p>
                {serp.status === 'ok' ? (
                  <p className="text-neutral-600">
                    Connected
                    {serp.searchesLeft !== null && (
                      <> — {serp.searchesLeft} searches left this month</>
                    )}
                    .
                  </p>
                ) : serp.status === 'error' ? (
                  <p className="text-red-600">
                    Configured but the check failed: {serp.message}
                  </p>
                ) : (
                  <div className="text-neutral-600">
                    <p className="mb-1">
                      Not configured. Needed for hotel and activity search
                      (free plan, 250 searches/month):
                    </p>
                    <ol className="list-decimal space-y-1 pl-5 text-xs">
                      <li>Sign up at serpapi.com (email + phone, no card).</li>
                      <li>Copy your API key from the dashboard.</li>
                      <li>
                        Add <code>SERPAPI_API_KEY=…</code> to{' '}
                        <code>.env.local</code> and restart the dev server.
                      </li>
                    </ol>
                    <p className="mt-1 text-xs">
                      Manual entry stays available without it.
                    </p>
                  </div>
                )}
              </li>
              <li className="rounded-lg border border-neutral-200 p-3">
                <p className="font-medium">OpenStreetMap / Nominatim</p>
                <p className="text-neutral-600">
                  Free geocoding. © OpenStreetMap contributors.
                </p>
              </li>
              <li className="rounded-lg border border-neutral-200 p-3">
                <p className="font-medium">Transitous</p>
                <p className="text-neutral-600">Free public transit routing.</p>
              </li>
              <li className="rounded-lg border border-neutral-200 p-3">
                <p className="font-medium">Frankfurter</p>
                <p className="text-neutral-600">
                  Free currency rates from the ECB.
                </p>
              </li>
            </ul>
          </section>
        </div>
      </main>
    </>
  );
}
