/**
 * `pull` and `push`: move records between a local ledger and a hub over HTTP. The ledger is a set, so
 * syncing is only ever "copy what the other side lacks": there is nothing to merge and nothing to lose.
 */
import { HellgateError, messageOf } from '../core/errors.ts';
import { canonicalJson } from '../core/canonical.ts';
import type { Config } from '../ledger/config.ts';
import { envelopeOf, parseRecord, type StoredRecord } from '../ledger/records.ts';
import type { Ledger } from '../ledger/store.ts';
import { acceptRecord, dependencyOrder } from './intake.ts';

export interface SyncResult {
  added: number;
  alreadyPresent: number;
  rejected: { id: string; reason: string }[];
}

/** The hub's route prefix for a tree. The hub's plain routes serve its first tree. */
const base = (url: string, tree: string | null): string => `${url.replace(/\/+$/, '')}/v1${tree === null ? '' : `/trees/${encodeURIComponent(tree)}`}`;

async function json(res: Response, what: string): Promise<any> {
  if (!res.ok) throw new HellgateError('environment', `${what}: the hub answered ${res.status} ${await res.text().catch(() => '')}`.trim());
  return res.json();
}

async function remoteIds(root: string): Promise<string[]> {
  const ids: string[] = [];
  let after: string | null = null;
  do {
    const page = await json(await fetch(`${root}/records?limit=1000${after ? `&after=${after}` : ''}`), 'listing records');
    ids.push(...(page.ids as string[]));
    after = page.next as string | null;
  } while (after !== null);
  return ids;
}

export async function pull(url: string, tree: string | null, ledger: Ledger, config: Config): Promise<SyncResult> {
  const root = base(url, tree);
  const missing = (await remoteIds(root)).filter((id) => !ledger.has(id));
  const records: StoredRecord[] = [];
  const result: SyncResult = { added: 0, alreadyPresent: 0, rejected: [] };
  for (const id of missing) {
    const parsed = parseRecord(await json(await fetch(`${root}/records/${id}`), `fetching ${id.slice(0, 8)}`));
    if (!parsed.ok) result.rejected.push({ id, reason: `${parsed.stage}: ${parsed.reason}` });
    else if (parsed.record.id !== id) result.rejected.push({ id, reason: 'the hub served a record whose body does not hash to the id asked for' });
    else records.push(parsed.record);
  }
  for (const record of dependencyOrder(records)) {
    try {
      const done = acceptRecord(ledger, config, envelopeOf(record));
      if (done.created) result.added++;
      else result.alreadyPresent++;
    } catch (err) {
      result.rejected.push({ id: record.id, reason: messageOf(err) });
    }
  }
  return result;
}

export async function push(url: string, tree: string | null, ledger: Ledger): Promise<SyncResult> {
  const root = base(url, tree);
  const theirs = new Set(await remoteIds(root));
  const { records } = ledger.scan();
  const result: SyncResult = { added: 0, alreadyPresent: 0, rejected: [] };
  for (const record of dependencyOrder([...records.values()].filter((r) => !theirs.has(r.id)))) {
    const res = await fetch(`${root}/records`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: canonicalJson(envelopeOf(record)) });
    if (res.status === 201) result.added++;
    else if (res.status === 200) result.alreadyPresent++;
    else result.rejected.push({ id: record.id, reason: `${res.status} ${(await res.text()).slice(0, 300)}` });
  }
  return result;
}
