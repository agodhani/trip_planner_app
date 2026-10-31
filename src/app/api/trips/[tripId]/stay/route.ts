import { NextResponse } from 'next/server';
import { getCurrentUser, isUuid } from '@/lib/auth/guards';
import { NotFoundError } from '@/lib/services/access';
import { runStaySearch } from '@/lib/services/stay';
import { ProviderError } from '@/lib/providers/types';

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const num = (v: string | null) => (v !== null && /^\d+$/.test(v) ? Number(v) : undefined);
const csvNums = (v: string | null) =>
  v ? v.split(',').map((s) => Number(s.trim())).filter((n) => Number.isInteger(n)) : undefined;

export async function GET(req: Request, ctx: { params: Promise<{ tripId: string }> }) {
  const { tripId } = await ctx.params;
  const user = await getCurrentUser();
  if (!user || !isUuid(tripId)) return NextResponse.json({ error: 'not found' }, { status: 404 });
  const p = new URL(req.url).searchParams;
  const checkIn = p.get('check_in');
  const checkOut = p.get('check_out');
  if (!checkIn || !DATE_RE.test(checkIn) || !checkOut || !DATE_RE.test(checkOut) || checkOut <= checkIn) {
    return NextResponse.json({ error: 'check_in and check_out are required (YYYY-MM-DD, check-out after check-in)' }, { status: 400 });
  }
  try {
    const r = await runStaySearch(user, tripId, {
      checkIn,
      checkOut,
      area: p.get('area') ?? undefined,
      sortBy: num(p.get('sort_by')),
      minPrice: num(p.get('min_price')),
      maxPrice: num(p.get('max_price')),
      propertyTypes: csvNums(p.get('property_types')),
      amenities: csvNums(p.get('amenities')),
      rating: num(p.get('rating')),
      hotelClass: csvNums(p.get('hotel_class')),
      freeCancellation: p.get('free_cancellation') === '1',
      vacationRentals: p.get('vacation_rentals') === '1',
      nextPageToken: p.get('next_page_token') ?? undefined,
    });
    return NextResponse.json(r);
  } catch (err) {
    if (err instanceof NotFoundError) return NextResponse.json({ error: 'not found' }, { status: 404 });
    if (err instanceof ProviderError) {
      const status = err.kind === 'not_configured' ? 503 : err.kind === 'quota_exceeded' ? 429 : 502;
      return NextResponse.json({ error: { kind: err.kind, message: err.message } }, { status });
    }
    throw err;
  }
}
