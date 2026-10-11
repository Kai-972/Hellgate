import { NextRequest, NextResponse } from 'next/server';
import { resolveTree } from '@/lib/hub';

export const dynamic = 'force-dynamic';

/** What the gate lets out: the tip of the gate path, or a given change if it passed. The hub decides; this only passes it on. */
export async function GET(req: NextRequest) {
  const hub = process.env.HELLGATE_HUB;
  if (!hub) return NextResponse.json({ error: 'Releasing needs the real hub (start the app with pnpm demo).' }, { status: 501 });
  const tree = await resolveTree(hub, req.nextUrl.searchParams.get('tree'));
  const change = req.nextUrl.searchParams.get('change');
  const res = await fetch(`${hub}/v1/trees/${tree}/production${change ? `?change=${encodeURIComponent(change)}` : ''}`, { cache: 'no-store' });
  return new NextResponse(res.body, { status: res.status, headers: { 'content-type': 'application/json' } });
}
