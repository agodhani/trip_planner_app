import { NextResponse } from 'next/server';
import { getCurrentUser, isUuid } from '@/lib/auth/guards';
import { NotFoundError } from '@/lib/services/access';
import { fetchPairOutbounds } from '@/lib/services/flights';
import { ProviderError } from '@/lib/providers/types';

export async function GET(req: Request, ctx: { params: Promise<{ tripId: string }> }) {
  const { tripId } = await ctx.params;
  const user = await getCurrentUser();
  if (!user || !isUuid(tripId)) return NextResponse.json({ error: 'not found' }, { status: 404 });
  const url = new URL(req.url);
  const depart = url.searchParams.get('depart');
  const back = url.searchParams.get('return') || null;
  if (!depart || !/^\d{4}-\d{2}-\d{2}$/.test(depart)) {
    return NextResponse.json({ error: 'depart is required (YYYY-MM-DD)' }, { status: 400 });
  }
  try {
    const r = await fetchPairOutbounds(user, tripId, depart, back);
    return NextResponse.json(r);
  } catch (err) {
    if (err instanceof NotFoundError) return NextResponse.json({ error: 'not found' }, { status: 404 });
    if (err instanceof ProviderError) return NextResponse.json({ error: { kind: err.kind, message: err.message } }, { status: 502 });
    throw err;
  }
}
