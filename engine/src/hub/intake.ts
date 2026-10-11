/**
 * Taking a record in from somewhere else (a POST to the hub, a `pull`): the checks of PROTOCOL §4 plus
 * the checks that tie a record to THIS tree. Nothing foreign is stored until it passes all of them.
 */
import { HellgateError } from '../core/errors.ts';
import type { Config } from '../ledger/config.ts';
import { parseRecord, type StoredRecord } from '../ledger/records.ts';
import { referenceProblems, type Ledger } from '../ledger/store.ts';

export const MAX_RECORD_BYTES = 8 * 1024 * 1024;

/** Validate `value` as a record of this tree and store it. Returns whether it was new. */
export function acceptRecord(ledger: Ledger, config: Config, value: unknown): { id: string; created: boolean; type: string } {
  const parsed = parseRecord(value);
  if (!parsed.ok) throw new HellgateError('integrity', `${parsed.stage}: ${parsed.reason}`);
  const record: StoredRecord = parsed.record;
  if ((record.type === 'change' || record.type === 'attestation') && (record.body.tree !== config.tree || record.body.suite !== config.suite)) {
    throw new HellgateError('refused', `this record belongs to tree "${record.body.tree}" on another suite, not to "${config.tree}"`);
  }
  const problems = referenceProblems(record, (id) => (ledger.has(id) ? ledger.get(id) : null));
  if (problems.length > 0) throw new HellgateError('integrity', problems.join('; '));
  return { ...ledger.put(record), type: record.type };
}

const RANK = { build: 0, recording: 1, change: 2, attestation: 3, receipt: 4 } as const;

/**
 * An order in which records can be accepted one after another: builds and recordings first, then
 * changes parent before child, then attestations and receipts.
 */
export function dependencyOrder(records: readonly StoredRecord[]): StoredRecord[] {
  const parentOf = new Map(records.filter((r) => r.type === 'change').map((r) => [r.id, r.type === 'change' ? r.body.parent : '']));
  const depth = (id: string, seen = 0): number => {
    const parent = parentOf.get(id);
    return parent === undefined || parent === 'genesis' || seen > 10_000 ? 0 : 1 + depth(parent, seen + 1);
  };
  return [...records].sort((a, b) => RANK[a.type] - RANK[b.type] || (a.type === 'change' ? depth(a.id) - depth(b.id) : 0) || (a.id < b.id ? -1 : 1));
}
