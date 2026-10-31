import { NextResponse } from 'next/server';
import { getCurrentUser, isUuid } from '@/lib/auth/guards';
import { NotFoundError } from '@/lib/services/access';
import { runActivitySearch } from '@/lib/services/activities';
import { ProviderError } from '@/lib/providers/types';

export async function GET(req: Request, ctx: { params: Promise<{ tripId: string }> }) {
  const { tripId } = await ctx.params;
  const user = await getCurrentUser();
  if (!user || !isUuid(tripId)) return NextResponse.json({ error: 'not found' }, { status: 404 });
  const p = new URL(req.url).searchParams;
  const q = (p.get('q') ?? '').trim();
  if (!q || q.length > 200) {
    return NextResponse.json({ error: 'q is required (1–200 chars)' }, { status: 400 });
  }
  const num = (k: string) => {
    const v = p.get(k);
    return v !== null && /^-?\d+(\.\d+)?$/.test(v) ? Number(v) : undefined;
  };
  try {
    const r = await runActivitySearch(user, tripId, {
      q,
      lat: num('lat'),
      lon: num('lon'),
      zoom: num('zoom'),
      start: num('start'),
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
