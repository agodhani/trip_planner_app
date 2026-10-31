import { NextResponse } from 'next/server';
import { getCurrentUser, isUuid } from '@/lib/auth/guards';
import { getSearch } from '@/lib/services/flights';
import { isMember } from '@/lib/services/trips';

export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const user = await getCurrentUser();
  if (!user || !isUuid(id)) return NextResponse.json({ error: 'not found' }, { status: 404 });
  const search = await getSearch(id);
  if (!search || !(await isMember(search.tripId, user.id))) {
    return NextResponse.json({ error: 'not found' }, { status: 404 });
  }
  return NextResponse.json({
    id: search.id, status: search.status, total: search.total,
    completed: search.completed, result: search.result, error: search.error,
    createdAt: search.createdAt, finishedAt: search.finishedAt,
  });
}
