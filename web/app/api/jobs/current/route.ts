export const dynamic = 'force-dynamic';

export async function GET() {
  const hub = process.env.HELLGATE_HUB;
  if (hub) {
    const res = await fetch(`${hub}/v1/jobs/current`);
    return new Response(res.body, { status: res.status });
  }
  return new Response(null, { status: 204 });
}
