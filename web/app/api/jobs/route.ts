import { NextRequest, NextResponse } from 'next/server';
import { resolveTree } from '@/lib/hub';

export async function POST(req: NextRequest) {
  const hub = process.env.HELLGATE_HUB;
  const token = process.env.HELLGATE_HUB_TOKEN;
  const bodyJson = await req.json().catch(() => ({}));
  if (hub) {
    // The page speaks {type, changeId, bot, instruction, tree}; the hub speaks {kind, change, as, instruction}
    // on a route per tree (PROTOCOL 10.1).
    const tree = await resolveTree(hub, bodyJson.tree);
    const kind = bodyJson.type ?? bodyJson.kind ?? 'challenge';
    const payload = kind === 'verify'
      ? { kind, change: bodyJson.changeId ?? bodyJson.change, as: bodyJson.bot ?? bodyJson.as ?? 'bot-1' }
      : { kind, instruction: bodyJson.instruction, parent: bodyJson.parent ?? null };
    const res = await fetch(`${hub}/v1/trees/${tree}/jobs`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
      body: JSON.stringify(payload),
    });
    const out = (await res.json().catch(() => ({}))) as { job?: string; error?: string };
    return NextResponse.json({ ...out, id: out.job }, { status: res.status });
  }
  // Mock mode: register job in demo store and return id
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
