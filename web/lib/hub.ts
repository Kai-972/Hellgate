/**
 * Talking to the real hub. The mock trees are called "coding-agent" and "optimizer"; a real hub names
 * its trees after what was created ("code", "ml"). Pages keep their defaults, and this maps a name to
 * the hub's tree by name first, then by domain.
 */
const ALIAS_DOMAIN: Record<string, 'code' | 'ml'> = { 'coding-agent': 'code', optimizer: 'ml' };

export interface HubTree {
  name: string;
  domain: 'code' | 'ml';
}

export async function hubTrees(hub: string): Promise<HubTree[]> {
  const res = await fetch(`${hub}/v1/trees`, { cache: 'no-store' });
  return res.ok ? ((await res.json()) as HubTree[]) : [];
}

export function pickTree(trees: HubTree[], wanted: string | null | undefined): string {
  const byName = trees.find((t) => t.name === wanted);
  if (byName) return byName.name;
  const domain = wanted ? ALIAS_DOMAIN[wanted] : undefined;
  return (domain && trees.find((t) => t.domain === domain)?.name) || trees.find((t) => t.domain === 'code')?.name || trees[0]?.name || String(wanted ?? '');
}

export async function resolveTree(hub: string, wanted: string | null | undefined): Promise<string> {
  return pickTree(await hubTrees(hub), wanted);
}
