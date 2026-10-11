/**
 * Builders for valid records, used by tests. Not part of the engine proper.
 */
import { sha256Hex } from '../core/canonical.ts';
import { signBody, type Identity } from '../identity/keys.ts';
import {
  EMPTY_BUILD_ID,
  buildBody,
  toRecord,
  type AttestationBody,
  type ChangeBody,
  type RecordingBody,
  type ReceiptBody,
  type StoredRecord,
} from './records.ts';

export const hex = (label: string): string => sha256Hex(`testkit|${label}`);
export const AT = '2026-01-01T00:00:00Z';

export function sampleBuild(variant = 'a'): StoredRecord {
  return toRecord(buildBody({ 'agent/index.ts': `export const v = '${variant}';\n` }));
}

export function sampleRecording(build: string, suite: string, over: Partial<RecordingBody> = {}): StoredRecord {
  return toRecord({
    type: 'recording', v: 1, build, suite, runs: 5,
    models: { primary: 'gemini:gemini-3.1-flash-lite', secondary: null },
    entries: [{ key: hex('req1'), slot: 'primary', response: { text: 'ok', finish: 'stop', inputTokens: 3, outputTokens: 1 } }],
    ...over,
  } satisfies RecordingBody);
}

export function changeBody(signer: string, over: Partial<ChangeBody> = {}): ChangeBody {
  return {
    type: 'change', v: 1, tree: 'demo', parent: 'genesis',
    build: hex('build'), parentBuild: EMPTY_BUILD_ID, suite: hex('suite'),
    claim: {
      hypothesis: 'Showing the model the exact signatures will raise the score.',
      falsifiedIf: 'Both verifiers measure under +3 points.',
      area: 'prompt', motif: 'signatures', predictedEffectBp: 500, contradicts: [], whyThisTime: null,
    },
    origin: { by: 'human', model: null, promptHash: null, instruction: null },
    mechanical: { status: 'ok', detail: '' },
    recording: null,
    claimed: { runs: 5, effectBp: 480, resultsDigest: hex('digest') },
    signer, createdAt: AT,
    ...over,
  };
}

export function signedChange(id: Identity, over: Partial<ChangeBody> = {}): StoredRecord {
  const body = changeBody(id.address, over);
  return toRecord(body, signBody(id, body).sig);
}

export function attestationBody(signer: string, change: StoredRecord, over: Partial<AttestationBody> = {}): AttestationBody {
  if (change.type !== 'change') throw new Error('not a change');
  const side = (base: number) => ({ runScoresBp: [base, base, base, base, base], taskMeansBp: { alpha: base, beta: base } });
  return {
    type: 'attestation', v: 1, tree: change.body.tree, change: change.id,
    parentBuild: change.body.parentBuild, build: change.body.build, suite: change.body.suite,
    mode: 'replay', runs: 5, parent: side(4000), candidate: side(5000),
    effectBp: 1000, ciLowBp: 400, ciHighBp: 1600, call: 'gain',
    resultsDigest: hex('results'), clean: true, notes: [], spotCheck: null, sealed: null,
    env: { model: 'gemini-3.1-flash-lite', engine: 'hellgate 0.1', node: 'v22', platform: 'linux' },
    signer, createdAt: AT,
    ...over,
  };
}

export function signedAttestation(id: Identity, change: StoredRecord, over: Partial<AttestationBody> = {}): StoredRecord {
  const body = attestationBody(id.address, change, over);
  return toRecord(body, signBody(id, body).sig);
}

export function sampleReceipt(record: string, account: string, over: Partial<ReceiptBody> = {}): StoredRecord {
  return toRecord({
    type: 'receipt', v: 1, record, network: 'testnet', tx: hex('tx'), ledger: 12345, closedAt: AT, account, ...over,
  } satisfies ReceiptBody);
}
