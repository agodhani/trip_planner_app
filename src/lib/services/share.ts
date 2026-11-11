import 'server-only';
import { createHash, randomBytes } from 'node:crypto';
import { and, asc, eq, gt, isNull, or } from 'drizzle-orm';
import { db } from '@/lib/db/client';
import { shareLinks, travelers, tripOptions, trips } from '@/lib/db/schema';
import { describeStrategy } from '@/lib/domain/dates/strategy';
import { buildShareView, linkIsActive, type ShareView } from '@/lib/domain/share-view';
import { env } from '@/lib/env';
import { assertTripRole } from './access';
import { recordEvent } from './events';
import { listItems, tripDays } from './itinerary';

function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

export type ShareLinkInfo = {
  id: string;
  expiresAt: Date | null;
  createdAt: Date;
};

/**
 * Default share-link lifetime: bounded like invites (their cap is 30 days)
 * but longer, since a read-only itinerary is usually shared for the whole
 * planning window. Pass expiresInDays: null for a link that only dies by
 * revocation.
 */
const DEFAULT_EXPIRY_DAYS = 90;
const MAX_EXPIRY_DAYS = 365;

export async function createShareLink(
  actor: { id: string; name: string },
  tripId: string,
  expiresInDays: number | null = DEFAULT_EXPIRY_DAYS,
): Promise<{ link: ShareLinkInfo; url: string }> {
  await assertTripRole(tripId, actor.id, 'owner');
  const expiresAt =
    expiresInDays === null
      ? null
      : new Date(
          Date.now() +
            Math.min(Math.max(1, Math.round(expiresInDays)), MAX_EXPIRY_DAYS) *
              24 * 60 * 60 * 1000,
        );
  const token = randomBytes(32).toString('base64url');

  const link = await db.transaction(async (tx) => {
    const [row] = await tx
      .insert(shareLinks)
      .values({
        tripId,
        tokenHash: hashToken(token),
        createdBy: actor.id,
        expiresAt,
      })
      .returning({
        id: shareLinks.id,
        expiresAt: shareLinks.expiresAt,
        createdAt: shareLinks.createdAt,
      });
    await recordEvent(tx, {
      tripId,
      userId: actor.id,
      verb: 'share_link.created',
      summary: `${actor.name} created a public share link`,
      entityType: 'share_link',
      entityId: row.id,
    });
    return row;
  });

  return { link: link as ShareLinkInfo, url: `${env.APP_URL}/share/${token}` };
}

/** Active (unrevoked, unexpired) share links for the owner to manage. */
export async function listShareLinks(tripId: string): Promise<ShareLinkInfo[]> {
  const rows = await db
    .select({
      id: shareLinks.id,
      expiresAt: shareLinks.expiresAt,
      createdAt: shareLinks.createdAt,
    })
    .from(shareLinks)
    .where(
      and(
        eq(shareLinks.tripId, tripId),
        isNull(shareLinks.revokedAt),
        or(isNull(shareLinks.expiresAt), gt(shareLinks.expiresAt, new Date())),
      ),
    )
    .orderBy(asc(shareLinks.createdAt));
  return rows as ShareLinkInfo[];
}

export async function revokeShareLink(
  actor: { id: string; name: string },
  tripId: string,
  linkId: string,
): Promise<void> {
  await assertTripRole(tripId, actor.id, 'owner');
  await db.transaction(async (tx) => {
    await tx
      .update(shareLinks)
      .set({ revokedAt: new Date() })
      .where(
        and(
          eq(shareLinks.id, linkId),
          eq(shareLinks.tripId, tripId),
          isNull(shareLinks.revokedAt),
        ),
      );
    await recordEvent(tx, {
      tripId,
      userId: actor.id,
      verb: 'share_link.revoked',
      summary: `${actor.name} revoked a public share link`,
      entityType: 'share_link',
      entityId: linkId,
    });
  });
}

/**
 * Resolve a share-link token to its sanitized view-model. Returns null for
 * unknown, revoked, or expired tokens — the page renders one friendly
 * "unavailable" state for all three so validity isn't leaked.
 */
export async function resolveShareToken(token: string): Promise<ShareView | null> {
  const linkRows = await db
    .select({
      tripId: shareLinks.tripId,
      revokedAt: shareLinks.revokedAt,
      expiresAt: shareLinks.expiresAt,
    })
    .from(shareLinks)
    .where(eq(shareLinks.tokenHash, hashToken(token)))
    .limit(1);
  const link = linkRows[0];
  if (!link || !linkIsActive(link)) return null;

  const tripRows = await db.select().from(trips).where(eq(trips.id, link.tripId)).limit(1);
  const trip = tripRows[0];
  if (!trip) return null;

  const [tvl, options, items] = await Promise.all([
    db
      .select({ displayName: travelers.displayName })
      .from(travelers)
      .where(eq(travelers.tripId, trip.id))
      .orderBy(asc(travelers.createdAt)),
    db
      .select({
        id: tripOptions.id,
        kind: tripOptions.kind,
        status: tripOptions.status,
        title: tripOptions.title,
        data: tripOptions.data,
        priceAmount: tripOptions.priceAmount,
        priceCurrency: tripOptions.priceCurrency,
        bookingRef: tripOptions.bookingRef,
        bookingUrl: tripOptions.bookingUrl,
      })
      .from(tripOptions)
      .where(eq(tripOptions.tripId, trip.id)),
    listItems(trip.id),
  ]);

  const range = tripDays(trip);
  return buildShareView({
    trip: {
      name: trip.name,
      originCity: trip.origin.city,
      destinationCity: trip.destination.city,
    },
    dates: trip.startDate ? { start: trip.startDate, end: trip.endDate } : null,
    planLabel: trip.startDate ? null : describeStrategy(trip.dateStrategy, trip.timePrefs),
    days: range?.days ?? [],
    travelerNames: tvl.map((t) => t.displayName),
    options: options.map((o) => ({
      id: o.id,
      kind: o.kind,
      status: o.status,
      title: o.title,
      data: o.data,
      priceAmount: o.priceAmount === null ? null : Number(o.priceAmount),
      priceCurrency: o.priceCurrency,
      bookingRef: o.bookingRef,
      bookingUrl: o.bookingUrl,
    })),
    items: items.map((i) => ({
      id: i.id,
      day: i.day,
      kind: i.kind,
      title: i.title,
      startTime: i.startTime,
      endTime: i.endTime,
      sortOrder: i.sortOrder,
      system: i.system,
      notes: i.notes,
    })),
  });
}
