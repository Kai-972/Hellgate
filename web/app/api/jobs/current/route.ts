export const dynamic = 'force-dynamic';

export async function GET() {
  const hub = process.env.HELLGATE_HUB;
  if (hub) {
    const res = await fetch(`${hub}/v1/jobs/current`, { cache: 'no-store' });
    if (res.status !== 200) return new Response(null, { status: res.status });
    const job = (await res.json()) as { job: string };
    return Response.json({ ...job, id: job.job });
  }
  return new Response(null, { status: 204 });
}
