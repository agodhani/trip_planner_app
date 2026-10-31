import { NextResponse } from 'next/server';
import { getCurrentUser, isUuid } from '@/lib/auth/guards';
import { NotFoundError } from '@/lib/services/access';
import { fetchPairReturns } from '@/lib/services/flights';
import { ProviderError } from '@/lib/providers/types';

export async function GET(req: Request, ctx: { params: Promise<{ tripId: string }> }) {
  const { tripId } = await ctx.params;
  const user = await getCurrentUser();
  if (!user || !isUuid(tripId)) return NextResponse.json({ error: 'not found' }, { status: 404 });
  const url = new URL(req.url);
  const depart = url.searchParams.get('depart');
  const back = url.searchParams.get('return');
  const outboundId = url.searchParams.get('outbound');
  if (!depart || !/^\d{4}-\d{2}-\d{2}$/.test(depart) || !back || !/^\d{4}-\d{2}-\d{2}$/.test(back) || !outboundId) {
    return NextResponse.json({ error: 'depart, return and outbound are required' }, { status: 400 });
  }
  try {
    const rr = await fetchPairReturns(user, tripId, depart, back, outboundId);
    return NextResponse.json(rr);
  } catch (err) {
    if (err instanceof NotFoundError) return NextResponse.json({ error: 'not found' }, { status: 404 });
    if (err instanceof ProviderError) return NextResponse.json({ error: { kind: err.kind, message: err.message } }, { status: 502 });
    throw err;
  }
}
