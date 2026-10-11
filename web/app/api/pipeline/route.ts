import { NextRequest, NextResponse } from 'next/server';
import { resolveTree } from '@/lib/hub';

export const dynamic = 'force-dynamic';

/** Where production and non-production stand, from the hub. */
export async function GET(req: NextRequest) {
  const hub = process.env.HELLGATE_HUB;
  if (!hub) return NextResponse.json({ error: 'The pipeline needs the real hub (start the app with pnpm demo).' }, { status: 501 });
  const tree = await resolveTree(hub, req.nextUrl.searchParams.get('tree'));
  const res = await fetch(`${hub}/v1/trees/${tree}/pipeline`, { cache: 'no-store' });
  return new NextResponse(res.body, { status: res.status, headers: { 'content-type': 'application/json' } });
}
