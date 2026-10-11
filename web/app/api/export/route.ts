import { NextRequest, NextResponse } from 'next/server';
import { resolveTree } from '@/lib/hub';
import { getExport } from '@/lib/demoStore';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const tree = req.nextUrl.searchParams.get('tree') ?? 'coding-agent';
  const hub = process.env.HELLGATE_HUB;
  if (hub) {
    const res = await fetch(`${hub}/v1/trees/${await resolveTree(hub, tree)}/export`);
    return new NextResponse(res.body, {
      status: res.status,
      headers: { 'content-type': 'application/json' },
    });
  }
  // Mock / Demo mode
  const data = getExport(tree);
  return NextResponse.json(data);
}
