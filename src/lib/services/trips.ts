import 'server-only';
import { and, desc, eq } from 'drizzle-orm';
import { db } from '@/lib/db/client';
import { tripMembers, travelers, trips, users } from '@/lib/db/schema';
import type { MemberRole } from '@/lib/db/schema';
import type { DateStrategy, TimePrefs } from '@/lib/domain/dates/strategy';
import { getAirport } from '@/lib/providers/airports';
import { geocodeFirst } from '@/lib/providers/osm/nominatim';
import { ProviderError, type PlaceRef } from '@/lib/providers/types';
import { recordEvent } from './events';

export type PlaceSelection = {
  city: string;
  countryCode: string;
  airports: string[];
  primaryIata: string;
};

export type CreateTripInput = {
  name?: string;
  origin: PlaceSelection;
  destination: PlaceSelection;
  adults: number;
  childrenAges: number[];
  cabin: 'economy' | 'premium_economy' | 'business' | 'first';
  maxStops: 'any' | 'nonstop' | 'one' | 'two';
  currency: string;
  dateStrategy: DateStrategy;
  timePrefs: TimePrefs;
};

/**
 * Build a PlaceRef: city centre comes from a Nominatim geocode, falling back
 * to the primary airport's coordinates; timezone from the primary airport.
 */
async function buildPlaceRef(sel: PlaceSelection): Promise<PlaceRef> {
  const primary = await getAirport(sel.primaryIata);
  let lat = primary?.lat ?? 0;
  let lon = primary?.lon ?? 0;
  try {
    const hit = await geocodeFirst(`${sel.city}, ${sel.countryCode}`);
    if (hit) {
      lat = hit.lat;
      lon = hit.lon;
    }
  } catch (err) {
    if (!(err instanceof ProviderError)) throw err;
    // Geocoding unavailable: fall back to the primary airport coordinates.
  }
  return {
    label: `${sel.city}, ${sel.countryCode}`,
    city: sel.city,
    countryCode: sel.countryCode,
    lat,
    lon,
    timezone: primary?.tz ?? 'UTC',
    airports: sel.airports,
  };
}

export type TripRow = typeof trips.$inferSelect;

export async function createTrip(
  user: { id: string; name: string },
  input: CreateTripInput,
): Promise<TripRow> {
  const [origin, destination] = await Promise.all([
    buildPlaceRef(input.origin),
    buildPlaceRef(input.destination),
  ]);

  const name =
    input.name?.trim() || `Trip to ${input.destination.city}`;

  return db.transaction(async (tx) => {
    const [trip] = await tx
      .insert(trips)
      .values({
        ownerId: user.id,
        name,
        origin,
        destination,
        adults: input.adults,
        childrenAges: input.childrenAges,
        cabin: input.cabin,
        maxStops: input.maxStops,
        currency: input.currency,
        dateStrategy: input.dateStrategy,
        timePrefs: input.timePrefs,
      })
      .returning();

    await tx.insert(tripMembers).values({
      tripId: trip.id,
      userId: user.id,
      role: 'owner',
    });

    await tx.insert(travelers).values({
      tripId: trip.id,
      displayName: user.name,
      userId: user.id,
    });

    await recordEvent(tx, {
      tripId: trip.id,
      userId: user.id,
      verb: 'trip.created',
      summary: `${user.name} created the trip`,
      entityType: 'trip',
      entityId: trip.id,
    });

    return trip;
  });
}

export type TripWithRole = { trip: TripRow; role: MemberRole };

export async function listTripsForUser(userId: string): Promise<TripWithRole[]> {
  const rows = await db
    .select({ trip: trips, role: tripMembers.role })
    .from(tripMembers)
    .innerJoin(trips, eq(tripMembers.tripId, trips.id))
    .where(eq(tripMembers.userId, userId))
    .orderBy(desc(trips.updatedAt));
  return rows;
}

export async function getTrip(tripId: string): Promise<TripRow | null> {
  const rows = await db.select().from(trips).where(eq(trips.id, tripId)).limit(1);
  return rows[0] ?? null;
}

export async function getTripVersion(tripId: string): Promise<number | null> {
  const rows = await db
    .select({ version: trips.version })
    .from(trips)
    .where(eq(trips.id, tripId))
    .limit(1);
  return rows[0]?.version ?? null;
}

export async function listMemberUsers(tripId: string) {
  return db
    .select({
      userId: users.id,
      name: users.name,
      email: users.email,
      role: tripMembers.role,
      joinedAt: tripMembers.joinedAt,
    })
    .from(tripMembers)
    .innerJoin(users, eq(tripMembers.userId, users.id))
    .where(eq(tripMembers.tripId, tripId));
}

export async function isMember(tripId: string, userId: string): Promise<boolean> {
  const rows = await db
    .select({ userId: tripMembers.userId })
    .from(tripMembers)
    .where(and(eq(tripMembers.tripId, tripId), eq(tripMembers.userId, userId)))
    .limit(1);
  return rows.length > 0;
}
