import { NextRequest, NextResponse } from 'next/server';
import { seedRichDemoData, resetDemoStore, getExport } from '@/lib/demoStore';

export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  const { action = 'seed', tree = 'coding-agent' } = await req.json().catch(() => ({}));

  if (action === 'reset') {
    resetDemoStore();
    return NextResponse.json({ ok: true, message: 'Demo store reset to baseline' });
  }

  const result = seedRichDemoData(tree);
  return NextResponse.json({
    ok: true,
    added: result.added,
    message: result.added > 0 ? `Seeded ${result.added} new demo changes for graph testing` : 'Demo changes already present',
    totals: result.tree?.totals,
  });
}

export async function GET(req: NextRequest) {
  const tree = req.nextUrl.searchParams.get('tree') ?? 'coding-agent';
  const exp = getExport(tree);
  return NextResponse.json({
    demoMode: !process.env.HELLGATE_HUB,
    hubConfigured: !!process.env.HELLGATE_HUB,
    totals: exp?.totals,
    changesCount: exp?.changes.length ?? 0,
  });
}
