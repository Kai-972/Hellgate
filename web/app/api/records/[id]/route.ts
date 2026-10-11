import { NextRequest, NextResponse } from 'next/server';
import { resolveTree } from '@/lib/hub';

export const dynamic = 'force-dynamic';

/** A raw record, exactly as the hub stores it, so the browser can check it for itself. */
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const hub = process.env.HELLGATE_HUB;
  if (!hub) return NextResponse.json({ error: 'Checking records needs the real hub (start with pnpm demo).' }, { status: 501 });
  const { id } = await params;
  const tree = await resolveTree(hub, req.nextUrl.searchParams.get('tree'));
  const res = await fetch(`${hub}/v1/trees/${tree}/records/${id}`, { cache: 'no-store' });
  return new NextResponse(res.body, { status: res.status, headers: { 'content-type': 'application/json' } });
}
