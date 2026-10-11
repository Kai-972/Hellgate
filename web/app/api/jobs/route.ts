import { NextRequest, NextResponse } from 'next/server';

export async function POST(req: NextRequest) {
  const hub = process.env.HELLGATE_HUB;
  const token = process.env.HELLGATE_HUB_TOKEN;
  if (hub) {
    const body = await req.text();
    const res = await fetch(`${hub}/v1/jobs`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body,
    });
    return new NextResponse(res.body, {
      status: res.status,
      headers: { 'content-type': 'application/json' },
    });
  }
  // Mock mode: register job in demo store and return id
  const bodyJson = await req.json().catch(() => ({}));
  const jobId = 'mock-job-' + Date.now();
  const { registerDemoJob } = await import('@/lib/demoStore');
  registerDemoJob({
    id: jobId,
    type: bodyJson.type ?? 'challenge',
    tree: bodyJson.tree ?? 'coding-agent',
    changeId: bodyJson.changeId,
    bot: bodyJson.bot,
    instruction: bodyJson.instruction,
  });
  return NextResponse.json({ id: jobId }, { status: 201 });
}
