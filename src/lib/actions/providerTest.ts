'use server';
import { requireUser } from '@/lib/auth/guards';
import { todayISO } from '@/lib/clock';
import { searchOutbounds } from '@/lib/providers/googleFlights';
import { DateTime } from 'luxon';
const last = new Map<string, number>();
export type TestState = { ok?: boolean; count?: number; error?: string };
export async function testGoogleFlightsAction(): Promise<TestState> {
  const user = await requireUser('/settings');
  const t = Date.now();
  if ((last.get(user.id) ?? 0) + 60_000 > t) return { error: 'Wait a minute between tests' };
  last.set(user.id, t);
  try {
    const d = DateTime.fromISO(todayISO(user.homeTimezone)).plus({ days: 30 }).toFormat('yyyy-MM-dd');
    const r = await searchOutbounds({ originAirports: ['JFK'], destinationAirports: ['LAX'], outboundDate: d, adults: 1, children: 0, infantsInSeat: 0, infantsOnLap: 0, cabin: 'economy', maxStops: 'any', currency: 'USD' }, { userId: user.id });
    return { ok: true, count: r.itineraries.length };
  } catch (e) { return { error: e instanceof Error && 'kind' in e ? String((e as {kind:string}).kind) : 'network' }; }
}