import { NextResponse } from 'next/server';
import { getTrees } from '@/lib/demoStore';

export const dynamic = 'force-dynamic';

export async function GET() {
  const hub = process.env.HELLGATE_HUB;
  if (hub) {
    const res = await fetch(`${hub}/v1/trees`);
    return new NextResponse(res.body, {
      status: res.status,
      headers: { 'content-type': 'application/json' },
    });
  }
  // Mock / Demo mode
  const data = getTrees();
  return NextResponse.json(data);
}
