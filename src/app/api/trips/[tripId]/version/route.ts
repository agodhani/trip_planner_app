import { NextResponse } from 'next/server';
import { getCurrentUser, isUuid } from '@/lib/auth/guards';
import { getTripVersion, isMember } from '@/lib/services/trips';

export async function GET(
  _req: Request,
  ctx: { params: Promise<{ tripId: string }> },
) {
  const { tripId } = await ctx.params;
  const user = await getCurrentUser();
  if (!user || !isUuid(tripId)) {
    return NextResponse.json({ error: 'not found' }, { status: 404 });
  }
  const member = await isMember(tripId, user.id);
  if (!member) {
    return NextResponse.json({ error: 'not found' }, { status: 404 });
  }
  const version = await getTripVersion(tripId);
  if (version === null) {
    return NextResponse.json({ error: 'not found' }, { status: 404 });
  }
  return NextResponse.json({ version });
}
