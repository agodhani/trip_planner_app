// Ported from fli (MIT, commit 881aee5ff): search/flights.py return
// expansion and core/links.py booking URLs.
import 'server-only';
import { createHash } from 'node:crypto';
import { env } from '@/lib/env';
import { getAirport } from '../airports';
import { cachedCall } from '../cache';
import type {
  FlightItinerary,
  FlightLeg,
  FlightSearchRequest,
  FlightSegment,
} from '../types';
import { decodeDs1, type RawItinerary } from './decode';
import { fetchDs1, pageUrl, setConcurrency, PROVIDER } from './fetch';
import {
  buildTfsToken,
  CABIN_SEAT,
  encodeTfsPayload,
  encodeTfsSegment,
  MAX_STOPS_FIELD,
  passengerCodes,
  type LegSpec,
} from './tfs';

setConcurrency(env.GOOGLE_FLIGHTS_CONCURRENCY);

type SearchOpts = { ttlSeconds?: number; tripId?: string; userId?: string };

function itineraryId(raw: RawItinerary): string {
  const key = raw.segments
    .map((s) => `${s.airlineCode}${s.flightNumber}@${s.departLocal}`)
    .join('|');
  return createHash('sha256').update(key).digest('hex').slice(0, 24);
}

async function toLeg(raw: RawItinerary): Promise<FlightLeg> {
  const fromTz = (await getAirport(raw.from))?.tz ?? 'UTC';
  const toTz = (await getAirport(raw.to))?.tz ?? 'UTC';
  const segments: FlightSegment[] = raw.segments.map((s) => ({
    airlineCode: s.airlineCode ?? '',
    airlineName: s.airlineName ?? s.airlineCode ?? '',
    flightNumber: s.flightNumber,
    from: { code: s.from },
    to: { code: s.to },
    departLocal: s.departLocal,
    arriveLocal: s.arriveLocal,
    durationMin: s.durationMin ?? 0,
    aircraft: s.aircraft,
    legroom: s.legroom,
    overnight: s.overnight,
  }));
  const airlines = [...new Set(segments.map((s) => s.airlineCode))];
  return {
    segments,
    layovers: raw.layovers.map((l) => ({
      airportCode: l.airportCode,
      airportName: l.airportName,
      durationMin: l.durationMin,
      overnight: l.overnight,
    })),
    from: { code: raw.from },
    to: { code: raw.to },
    departLocal: raw.departLocal,
    arriveLocal: raw.arriveLocal,
    fromTz,
    toTz,
    durationMin: raw.durationMin ?? 0,
    stops: Math.max(0, segments.length - 1),
    airlines,
  };
}

export function buildBookingUrl(
  it: FlightItinerary,
  req: Pick<FlightSearchRequest, 'adults' | 'children' | 'infantsInSeat' | 'infantsOnLap' | 'cabin' | 'currency'>,
): string {
  const toSpecs = (leg: FlightLeg): LegSpec[] =>
    leg.segments.map((s) => ({
      origin: s.from.code,
      depDate: s.departLocal.slice(0, 10),
      dest: s.to.code,
      airline: s.airlineCode,
      flightNumber: s.flightNumber,
    }));
  const segments = it.return
    ? [toSpecs(it.outbound), toSpecs(it.return)]
    : [toSpecs(it.outbound)];
  const tfs = buildTfsToken(segments, {
    isOneWay: !it.return,
    passengers: passengerCodes(req),
    seat: CABIN_SEAT[req.cabin] ?? 1,
  });
  return `https://www.google.com/travel/flights/booking?tfs=${tfs}&curr=${req.currency}&hl=${env.GOOGLE_FLIGHTS_HL}&gl=${env.GOOGLE_FLIGHTS_GL}`;
}

function legSpecs(leg: FlightLeg): LegSpec[] {
  return leg.segments.map((s) => ({
    origin: s.from.code,
    depDate: s.departLocal.slice(0, 10),
    dest: s.to.code,
    airline: s.airlineCode,
    flightNumber: s.flightNumber,
  }));
}

function searchTfs(req: FlightSearchRequest, pinned?: LegSpec[]): string {
  const stops = MAX_STOPS_FIELD[req.maxStops];
  const segments = Buffer.concat([
    encodeTfsSegment(req.originAirports, req.destinationAirports, req.outboundDate, {
      maxStops: stops,
      legs: pinned,
    }),
    ...(req.returnDate
      ? [encodeTfsSegment(req.destinationAirports, req.originAirports, req.returnDate, {
          maxStops: stops,
        })]
      : []),
  ]);
  return encodeTfsPayload(segments, {
    isOneWay: !req.returnDate,
    passengers: passengerCodes(req),
    seat: CABIN_SEAT[req.cabin] ?? 1,
  });
}

async function normalize(
  raws: { raw: RawItinerary; isBest: boolean }[],
  req: FlightSearchRequest,
  opts: { isFrom: boolean },
): Promise<FlightItinerary[]> {
  const out: FlightItinerary[] = [];
  for (const { raw, isBest } of raws) {
    const outbound = await toLeg(raw);
    const it: FlightItinerary = {
      id: itineraryId(raw),
      outbound,
      price: {
        total: raw.price,
        perPerson:
          raw.price !== null ? raw.price / Math.max(1, req.adults + req.children + req.infantsInSeat) : null,
        currency: raw.currency ?? req.currency,
        isFrom: opts.isFrom,
      },
      bookingUrl: '',
      isBest,
      emissionsKg: raw.emissionsKg,
      fetchedAt: new Date().toISOString(),
    };
    it.bookingUrl = buildBookingUrl(it, req);
    out.push(it);
  }
  return out;
}

export type OutboundsResult = {
  itineraries: FlightItinerary[];
  searchUrl: string;
  rawCount: number;
  sparsePassengerMix: boolean;
};

export async function searchOutbounds(
  req: FlightSearchRequest,
  opts: SearchOpts = {},
): Promise<OutboundsResult> {
  const request = { op: 'outbounds', req };
  return cachedCall(
    {
      provider: PROVIDER,
      operation: 'outbounds',
      request,
      ttlSeconds: opts.ttlSeconds ?? 30 * 60,
      tripId: opts.tripId,
      userId: opts.userId,
    },
    async () => {
      const tfs = searchTfs(req);
      const url = pageUrl(tfs, {
        currency: req.currency,
        hl: env.GOOGLE_FLIGHTS_HL,
        gl: env.GOOGLE_FLIGHTS_GL,
      });
      const data = await fetchDs1(url, request, 'outbounds');
      const { best, other } = decodeDs1(data);
      const rawCount = best.length + other.length;
      const hasKids =
        req.children + req.infantsInSeat + req.infantsOnLap > 0;
      const itineraries = await normalize(
        [
          ...best.map((raw) => ({ raw, isBest: true })),
          ...other.map((raw) => ({ raw, isBest: false })),
        ],
        req,
        { isFrom: !!req.returnDate },
      );
      return {
        itineraries,
        searchUrl: url,
        rawCount,
        sparsePassengerMix: rawCount === 0 && hasKids,
      };
    },
  );
}

export type ReturnsResult = { itineraries: FlightItinerary[] };

export async function searchReturns(
  req: FlightSearchRequest & { returnDate: string },
  outbound: FlightItinerary,
  opts: SearchOpts = {},
): Promise<ReturnsResult> {
  const request = { op: 'returns', req, outboundId: outbound.id };
  return cachedCall(
    {
      provider: PROVIDER,
      operation: 'returns',
      request,
      ttlSeconds: opts.ttlSeconds ?? 30 * 60,
      tripId: opts.tripId,
      userId: opts.userId,
    },
    async () => {
      const tfs = searchTfs(req, legSpecs(outbound.outbound));
      const url = pageUrl(tfs, {
        currency: req.currency,
        hl: env.GOOGLE_FLIGHTS_HL,
        gl: env.GOOGLE_FLIGHTS_GL,
      });
      const data = await fetchDs1(url, request, 'returns');
      const { best, other } = decodeDs1(data);
      const returns = await normalize(
        [
          ...best.map((raw) => ({ raw, isBest: true })),
          ...other.map((raw) => ({ raw, isBest: false })),
        ],
        req,
        { isFrom: false },
      );
      return {
        itineraries: returns.map((it) => ({
          ...it,
          outbound: outbound.outbound,
          return: it.outbound,
        })),
      };
    },
  );
}
