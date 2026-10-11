import { hashCanonical } from './hash.js';

export type RecordId = string;

export function makeRecordId(type: string, payload: unknown): RecordId {
  return hashCanonical({ type, payload });
}

export function makeBuildId(files: Record<string, string>): RecordId {
  return hashCanonical({ type: 'build', files });
}

export function makeSuiteId(tasks: Record<string, unknown>): RecordId {
  return hashCanonical({ type: 'suite', tasks });
}
