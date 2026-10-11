import { NextRequest } from 'next/server';
import { readFileSync } from 'fs';
import path from 'path';

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const hub = process.env.HELLGATE_HUB;

  if (hub) {
    const res = await fetch(`${hub}/v1/jobs/${id}/events`);
    return new Response(res.body, {
      status: res.status,
      headers: {
        'content-type': 'text/event-stream',
        'cache-control': 'no-cache',
        connection: 'keep-alive',
      },
    });
  }

  // Mock mode: replay job-events.sample.json with delays
  const mockPath = path.join(process.cwd(), 'mock', 'job-events.sample.json');
  const raw = readFileSync(mockPath, 'utf-8');
  const { events } = JSON.parse(raw) as {
    events: Array<{ event: string; data: unknown; delayMs: number }>;
  };

  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      for (const item of events) {
        // Fast replay for responsive demo UX
        const delay = Math.min(Math.round(item.delayMs * 0.2), 30);
        if (delay > 0) {
          await new Promise((r) => setTimeout(r, delay));
        }

        let eventData = item.data;
        if (item.event === 'done') {
          const { completeDemoJob } = await import('@/lib/demoStore');
          const outcome = completeDemoJob(id);
          if (outcome.changeId) {
            const dataObj = item.data as { result?: Record<string, unknown> };
            if (dataObj.result) {
              dataObj.result.change = outcome.changeId;
            }
            eventData = dataObj;
          }
        }

        const msg = `event: ${item.event}\ndata: ${JSON.stringify(eventData)}\n\n`;
        controller.enqueue(encoder.encode(msg));
      }
      controller.close();
    },
  });

  return new Response(stream, {
    status: 200,
    headers: {
      'content-type': 'text/event-stream',
      'cache-control': 'no-cache',
      connection: 'keep-alive',
    },
  });
}
