import { NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/auth/guards';
import { searchPlaces } from '@/lib/providers/airports';

export async function GET(req: Request) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }
  const q = new URL(req.url).searchParams.get('q') ?? '';
  const results = await searchPlaces(q);
  return NextResponse.json({ results });
}
