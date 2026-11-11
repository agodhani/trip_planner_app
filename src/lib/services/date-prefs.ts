import 'server-only';
import { eq } from 'drizzle-orm';
import { db } from '@/lib/db/client';
import { datePairPrefs, users } from '@/lib/db/schema';
import { pairId, type PairAvail, type PairRef } from '@/lib/domain/date-prefs';
import { dateRange } from '@/lib/ui-format';
import { assertTripRole } from './access';
import { recordEvent } from './events';

const DAY_RE = /^\d{4}-\d{2}-\d{2}$/;

/** Feed/UI wording for each mark: 'works' | 'maybe' | 'no'. */
const AVAIL_LABEL: Record<PairAvail, string> = {
  works: 'works',
  maybe: 'maybe',
  no: 'can’t go',
};

export type PairPrefRow = {
  userId: string;
  userName: string;
  depart: string;
  back: string | null;
  value: PairAvail;
};

export async function listPairPrefs(tripId: string): Promise<PairPrefRow[]> {
  const rows = await db
    .select({
      userId: datePairPrefs.userId,
      userName: users.name,
      depart: datePairPrefs.depart,
      back: datePairPrefs.back,
      value: datePairPrefs.value,
    })
    .from(datePairPrefs)
    .innerJoin(users, eq(datePairPrefs.userId, users.id))
    .where(eq(datePairPrefs.tripId, tripId));
  return rows.map((r) => ({ ...r, back: r.back || null }));
}

/**
 * A member marks their own availability on a strategy-derived date pair —
 * the userId always comes from the session, never from input. Anyone who
 * can vote/comment (viewer+) may respond; all three values persist (there
 * is no "unmark" — changing your mind is another upsert).
 */
export async function setPairPref(
  user: { id: string; name: string },
  tripId: string,
  pair: PairRef,
  value: PairAvail,
): Promise<void> {
  await assertTripRole(tripId, user.id, 'viewer');
  if (!DAY_RE.test(pair.depart) || (pair.back !== null && !DAY_RE.test(pair.back))) {
    throw new Error('Invalid date pair');
  }
  await db.transaction(async (tx) => {
    await tx
      .insert(datePairPrefs)
      .values({
        tripId,
        userId: user.id,
        depart: pair.depart,
        back: pair.back ?? '',
        value,
        updatedAt: new Date(),
      })
      .onConflictDoUpdate({
        target: [
          datePairPrefs.tripId,
          datePairPrefs.userId,
          datePairPrefs.depart,
          datePairPrefs.back,
        ],
        set: { value, updatedAt: new Date() },
      });
    await recordEvent(tx, {
      tripId,
      userId: user.id,
      verb: 'dates.pref_set',
      summary: `${user.name} marked ${dateRange(pair.depart, pair.back)} as ${AVAIL_LABEL[value]}`,
      entityType: 'date_pair',
      entityId: pairId(pair),
    });
  });
}
