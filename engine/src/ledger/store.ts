/**
 * The ledger: a set of immutable, self-checking record files.
 *
 *   <root>/.hellgate/records/<id[0:2]>/<id[2:]>.json
 *
 * It is a set, not a chain. Two machines that each add records never conflict, and syncing is
 * a union of files. Nothing here decides a verdict; order never matters.
 *
 * A file is trusted only after three checks, in this order: its schema, that its file name is
 * the hash of its body, and (for signed records) its signature. A file that fails any of them
 * is reported as a `Problem` and ignored, never used.
 */
import { existsSync, mkdirSync, readFileSync, readdirSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

import { canonicalJson } from '../core/canonical.ts';
import { HellgateError } from '../core/errors.ts';
import {
  EMPTY_BUILD,
  EMPTY_BUILD_ID,
  envelopeOf,
  parseRecord,
  type RecordType,
  type StoredRecord,
} from './records.ts';

export const STATE_DIR = '.hellgate';

export interface Problem {
  /** Path of the offending file, relative to the records directory. */
  file: string;
  stage: 'json' | 'shape' | 'schema' | 'id' | 'signature';
  reason: string;
}

export interface ScanResult {
  records: Map<string, StoredRecord>;
  problems: Problem[];
}

export interface MergeResult {
  added: number;
  alreadyPresent: number;
  rejected: Problem[];
}

const EMPTY_BUILD_RECORD: StoredRecord = { id: EMPTY_BUILD_ID, type: 'build', body: EMPTY_BUILD };

export class Ledger {
  readonly root: string;
  readonly recordsDir: string;

  constructor(root: string) {
    this.root = root;
    this.recordsDir = join(root, STATE_DIR, 'records');
  }

  pathOf(id: string): string {
    return join(this.recordsDir, id.slice(0, 2), `${id.slice(2)}.json`);
  }

  /** The empty build is part of every ledger without being stored. */
  has(id: string): boolean {
    return id === EMPTY_BUILD_ID || existsSync(this.pathOf(id));
  }

  /**
   * Store a record. It is already validated (it is a `StoredRecord`), the write is atomic, and
   * an id that is already present is left alone: the same id means the same body.
   */
  put(record: StoredRecord): { id: string; created: boolean } {
    if (record.id === EMPTY_BUILD_ID) return { id: record.id, created: false };
    const path = this.pathOf(record.id);
    if (existsSync(path)) return { id: record.id, created: false };
    mkdirSync(join(this.recordsDir, record.id.slice(0, 2)), { recursive: true });
    const tmp = `${path}.${process.pid}.tmp`;
    try {
      writeFileSync(tmp, `${canonicalJson(envelopeOf(record))}\n`, { encoding: 'utf8', mode: 0o644 });
      renameSync(tmp, path);
    } catch (err) {
      rmSync(tmp, { force: true });
      throw err;
    }
    return { id: record.id, created: true };
  }

  /** Read one record with every check. Throws if it is missing or does not check out. */
  get(id: string): StoredRecord {
    if (id === EMPTY_BUILD_ID) return EMPTY_BUILD_RECORD;
    const path = this.pathOf(id);
    if (!/^[0-9a-f]{64}$/.test(id)) throw new HellgateError('usage', `"${id}" is not a record id`);
    if (!existsSync(path)) throw new HellgateError('not-found', `no record ${id}`);
    const checked = this.readFile(path, `${id.slice(0, 2)}/${id.slice(2)}.json`, id);
    if ('stage' in checked) throw new HellgateError('integrity', `record ${id} does not check out (${checked.stage}): ${checked.reason}`);
    return checked;
  }

  /** `get` for a record that must have a given type. */
  getTyped<T extends RecordType>(id: string, type: T): Extract<StoredRecord, { type: T }> {
    const record = this.get(id);
    if (record.type !== type) throw new HellgateError('integrity', `record ${id} is a ${record.type}, not a ${type}`);
    return record as Extract<StoredRecord, { type: T }>;
  }

  /** Every stored id, sorted. The virtual empty build is not listed. */
  ids(): string[] {
    const out: string[] = [];
    if (!existsSync(this.recordsDir)) return out;
    for (const dir of readdirSync(this.recordsDir)) {
      if (!/^[0-9a-f]{2}$/.test(dir)) continue;
      for (const file of readdirSync(join(this.recordsDir, dir))) {
        const m = /^([0-9a-f]{62})\.json$/.exec(file);
        if (m) out.push(`${dir}${m[1]}`);
      }
    }
    return out.sort();
  }

  /** Read and check every file. Good records are returned; bad ones are reported and ignored. */
  scan(): ScanResult {
    const records = new Map<string, StoredRecord>();
    const problems: Problem[] = [];
    if (!existsSync(this.recordsDir)) return { records, problems };
    for (const dir of readdirSync(this.recordsDir).sort()) {
      if (!/^[0-9a-f]{2}$/.test(dir)) continue;
      for (const file of readdirSync(join(this.recordsDir, dir)).sort()) {
        const rel = `${dir}/${file}`;
        const m = /^([0-9a-f]{62})\.json$/.exec(file);
        if (!m) {
          if (!file.endsWith('.tmp')) problems.push({ file: rel, stage: 'shape', reason: 'not a record file name' });
          continue;
        }
        const checked = this.readFile(join(this.recordsDir, dir, file), rel, `${dir}${m[1]}`);
        if ('stage' in checked) problems.push(checked);
        else records.set(checked.id, checked);
      }
    }
    return { records, problems };
  }

  /** Union: copy every valid record of `other` that this ledger lacks. Idempotent and order-independent. */
  merge(other: Ledger): MergeResult {
    const { records, problems } = other.scan();
    let added = 0;
    let alreadyPresent = 0;
    for (const record of records.values()) {
      if (this.put(record).created) added++;
      else alreadyPresent++;
    }
    return { added, alreadyPresent, rejected: problems };
  }

  private readFile(path: string, rel: string, expectedId: string): StoredRecord | Problem {
    let value: unknown;
    try {
      value = JSON.parse(readFileSync(path, 'utf8'));
    } catch {
      return { file: rel, stage: 'json', reason: 'not valid JSON' };
    }
    const parsed = parseRecord(value);
    if (!parsed.ok) return { file: rel, stage: parsed.stage, reason: parsed.reason };
    if (parsed.record.id !== expectedId) {
      return { file: rel, stage: 'id', reason: `the file name is ${expectedId.slice(0, 12)}… but the body hashes to ${parsed.record.id.slice(0, 12)}…` };
    }
    return parsed.record;
  }
}

/* ------------------------------------------------------------------ references */

/**
 * The problems with how a record points at other records, or an empty list. The hub and
 * `verify` call this before they trust a record, so evidence can never refer to something
 * nobody holds.
 */
export function referenceProblems(record: StoredRecord, get: (id: string) => StoredRecord | null): string[] {
  const out: string[] = [];
  const need = <T extends RecordType>(id: string, type: T, label: string): Extract<StoredRecord, { type: T }> | null => {
    const found = get(id);
    if (found === null) {
      out.push(`${label} ${id.slice(0, 12)}… is not held`);
      return null;
    }
    if (found.type !== type) {
      out.push(`${label} ${id.slice(0, 12)}… is a ${found.type}, not a ${type}`);
      return null;
    }
    return found as Extract<StoredRecord, { type: T }>;
  };

  switch (record.type) {
    case 'build':
      break;
    case 'recording': {
      need(record.body.build, 'build', 'the recording\'s build');
      break;
    }
    case 'change': {
      const b = record.body;
      need(b.build, 'build', 'the build');
      need(b.parentBuild, 'build', 'the parent build');
      if (b.recording !== null) {
        const rec = need(b.recording, 'recording', 'the recording');
        if (rec !== null) {
          if (rec.body.build !== b.build) out.push('the recording is for a different build');
          if (rec.body.suite !== b.suite) out.push('the recording is for a different suite');
        }
      }
      if (b.parent !== 'genesis') {
        const parent = need(b.parent, 'change', 'the parent change');
        if (parent !== null) {
          if (parent.body.build !== b.parentBuild) out.push('parentBuild is not the parent change\'s build');
          if (parent.body.suite !== b.suite) out.push('the parent change is on a different suite');
          if (parent.body.tree !== b.tree) out.push('the parent change is in a different tree');
        }
      }
      break;
    }
    case 'attestation': {
      const a = record.body;
      const change = need(a.change, 'change', 'the change');
      if (change !== null) {
        if (change.body.build !== a.build) out.push('the attestation names a different build than its change');
        if (change.body.parentBuild !== a.parentBuild) out.push('the attestation names a different parent build than its change');
        if (change.body.suite !== a.suite) out.push('the attestation names a different suite than its change');
        if (change.body.tree !== a.tree) out.push('the attestation is for a different tree than its change');
      }
      break;
    }
    case 'receipt': {
      const target = get(record.body.record);
      if (target === null) out.push(`the receipt's record ${record.body.record.slice(0, 12)}… is not held`);
      else if (target.type !== 'change' && target.type !== 'attestation') out.push('a receipt can only point at a change or an attestation');
      break;
    }
  }
  return out;
}
