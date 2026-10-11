import { NextRequest, NextResponse } from 'next/server';
import { resolveTree } from '@/lib/hub';

/** Demo helper: put the baseline back in production so the pipeline can be run again. */
export async function POST(req: NextRequest) {
  const hub = process.env.HELLGATE_HUB;
  if (!hub) return NextResponse.json({ error: 'needs the real hub' }, { status: 501 });
  const { tree } = (await req.json().catch(() => ({}))) as { tree?: string };
  const res = await fetch(`${hub}/v1/trees/${await resolveTree(hub, tree)}/production`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...(process.env.HELLGATE_HUB_TOKEN ? { Authorization: `Bearer ${process.env.HELLGATE_HUB_TOKEN}` } : {}) },
    body: JSON.stringify({ action: 'reset' }),
  });
  return new NextResponse(res.body, { status: res.status, headers: { 'content-type': 'application/json' } });
}
