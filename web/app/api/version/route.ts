import { NextRequest, NextResponse } from 'next/server';
import { getVersion } from '@/lib/demoStore';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const tree = req.nextUrl.searchParams.get('tree') ?? 'coding-agent';
  const hub = process.env.HELLGATE_HUB;
  if (hub) {
    const res = await fetch(`${hub}/v1/trees/${tree}/version`);
    return new NextResponse(res.body, {
      status: res.status,
      headers: { 'content-type': 'application/json' },
    });
  }
  // Mock / Demo mode: dynamic version from demoStore
  return NextResponse.json({ version: getVersion(tree) });
}
