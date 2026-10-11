/**
 * The five record types of PROTOCOL §5, as strict schemas.
 *
 *   build, recording, receipt   unsigned objects
 *   change, attestation         signed by their author / verifier
 *
 * Every schema is strict: an unknown key is an error, because an unknown key would change
 * the bytes that are hashed and signed. No schema produces `undefined`, since canonical JSON
 * has no encoding for it. "Nothing" is always `null`.
 */
import { z } from 'zod';

import { idOf } from '../core/canonical.ts';
import { isAddress } from '../identity/strkey.ts';
import { checkSignature } from '../identity/keys.ts';

/* ------------------------------------------------------------------ primitives */

export const Hex64 = z.string().regex(/^[0-9a-f]{64}$/, 'must be 64 lowercase hex characters');
export const Hex128 = z.string().regex(/^[0-9a-f]{128}$/, 'must be 128 lowercase hex characters');
export const Addr = z.string().refine(isAddress, 'must be a Stellar public address (G…)');
export const Iso = z.string().regex(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{1,3})?Z$/, 'must be an ISO-8601 UTC time');

const Bp = z.int().min(0).max(10_000);
const SignedBp = z.int().min(-10_000).max(10_000);
const OddRuns = z.int().min(3).max(99).refine((n) => n % 2 === 1, 'must be odd');
const Kebab = z.string().min(1).max(40).regex(/^[a-z0-9]+(-[a-z0-9]+){0,5}$/, 'must be kebab-case');
const TaskId = z.string().min(1).max(64).regex(/^[a-z0-9][a-z0-9-]*$/);
export const TreeName = z.string().min(1).max(64).regex(/^[a-z0-9][a-z0-9-]*$/);
/** `provider:model`, e.g. `gemini:gemini-3.1-flash-lite`. */
export const ModelRef = z.string().max(96).regex(/^(gemini|groq):[A-Za-z0-9._/-]+$/, 'must look like provider:model');

/* ------------------------------------------------------------------ build */

export const BUILD_PATH = /^(agent|learner)\/[a-z0-9_-]+\.ts$/;
const MAX_BUILD_FILES = 24;
const MAX_FILE_CHARS = 40_000;

export const BuildBody = z.strictObject({
  type: z.literal('build'),
  v: z.literal(1),
  files: z.record(z.string(), z.string()),
}).superRefine((b, ctx) => {
  const paths = Object.keys(b.files);
  if (paths.length > MAX_BUILD_FILES) ctx.addIssue({ code: 'custom', message: `at most ${MAX_BUILD_FILES} files` });
  const roots = new Set(paths.map((p) => p.split('/')[0]));
  if (roots.size > 1) ctx.addIssue({ code: 'custom', message: 'a build lives under exactly one of agent/ or learner/' });
  for (const [path, contents] of Object.entries(b.files)) {
    if (!BUILD_PATH.test(path)) ctx.addIssue({ code: 'custom', message: `bad path "${path}"` });
    if (contents.includes('\r')) ctx.addIssue({ code: 'custom', message: `${path} has a carriage return` });
    if (contents.length === 0 || !contents.endsWith('\n')) ctx.addIssue({ code: 'custom', message: `${path} must be non-empty and end with a newline` });
    if (contents.length > MAX_FILE_CHARS) ctx.addIssue({ code: 'custom', message: `${path} is longer than ${MAX_FILE_CHARS} characters` });
  }
});
export type BuildBody = z.infer<typeof BuildBody>;

/** The body of the empty build, the parent of every genesis change. */
export const EMPTY_BUILD: BuildBody = { type: 'build', v: 1, files: {} };
export const EMPTY_BUILD_ID = idOf(EMPTY_BUILD);

export function buildBody(files: Record<string, string>): BuildBody {
  return { type: 'build', v: 1, files: { ...files } };
}

/* ------------------------------------------------------------------ recording */

const Finish = z.enum(['stop', 'length', 'other']);

export const RecordingBody = z.strictObject({
  type: z.literal('recording'),
  v: z.literal(1),
  build: Hex64,
  suite: Hex64,
  runs: OddRuns,
  models: z.strictObject({ primary: ModelRef, secondary: ModelRef.nullable() }),
  entries: z.array(z.strictObject({
    key: Hex64,
    slot: z.enum(['primary', 'secondary']),
    response: z.strictObject({
      text: z.string().max(200_000),
      finish: Finish,
      inputTokens: z.int().min(0),
      outputTokens: z.int().min(0),
    }),
  })).max(20_000),
}).superRefine((r, ctx) => {
  for (let i = 1; i < r.entries.length; i++) {
    const prev = r.entries[i - 1]!.key;
    const cur = r.entries[i]!.key;
    if (!(prev < cur)) ctx.addIssue({ code: 'custom', message: `entries must be sorted by key with no duplicates (at ${i})` });
  }
  for (const e of r.entries) {
    if (e.slot === 'secondary' && r.models.secondary === null) {
      ctx.addIssue({ code: 'custom', message: 'an entry uses the secondary slot but models.secondary is null' });
    }
  }
});
export type RecordingBody = z.infer<typeof RecordingBody>;

/* ------------------------------------------------------------------ change */

export const MECHANICAL_STATUSES = [
  'ok', 'bad-path', 'too-large', 'frozen-file', 'bad-signature', 'bad-import',
  'graveyard-rule', 'unfalsifiable', 'typecheck', 'crash',
] as const;

export const ChangeBody = z.strictObject({
  type: z.literal('change'),
  v: z.literal(1),
  tree: TreeName,
  parent: z.union([Hex64, z.literal('genesis')]),
  build: Hex64,
  parentBuild: Hex64,
  suite: Hex64,
  claim: z.strictObject({
    hypothesis: z.string().min(30).max(600),
    falsifiedIf: z.string().min(15).max(400),
    area: z.string().min(1).max(32).regex(/^[a-z][a-z-]*$/),
    motif: Kebab,
    predictedEffectBp: SignedBp.refine((n) => n !== 0, 'must be non-zero'),
    contradicts: z.array(z.strictObject({ change: Hex64, why: z.string().min(1).max(300) })).max(3),
    whyThisTime: z.string().min(1).max(400).nullable(),
  }),
  origin: z.strictObject({
    by: z.enum(['human', 'agent', 'challenge']),
    model: z.string().max(96).nullable(),
    promptHash: Hex64.nullable(),
    instruction: z.string().min(1).max(280).nullable(),
  }),
  mechanical: z.strictObject({
    status: z.enum(MECHANICAL_STATUSES),
    detail: z.string().max(4000),
  }),
  recording: Hex64.nullable(),
  claimed: z.strictObject({ runs: OddRuns, effectBp: SignedBp, resultsDigest: Hex64 }).nullable(),
  signer: Addr,
  createdAt: Iso,
}).superRefine((c, ctx) => {
  if (c.parent === 'genesis' && c.parentBuild !== EMPTY_BUILD_ID) {
    ctx.addIssue({ code: 'custom', message: 'a genesis change must have the empty build as its parent build' });
  }
  if ((c.origin.by === 'challenge') !== (c.origin.instruction !== null)) {
    ctx.addIssue({ code: 'custom', message: 'origin.instruction is set exactly when origin.by is "challenge"' });
  }
  if (c.mechanical.status !== 'ok') {
    if (c.recording !== null || c.claimed !== null) {
      ctx.addIssue({ code: 'custom', message: 'a change that never ran has no recording and no claimed result' });
    }
  } else if (c.claimed === null) {
    ctx.addIssue({ code: 'custom', message: 'a change that ran must carry its claimed result' });
  }
});
export type ChangeBody = z.infer<typeof ChangeBody>;

/* ------------------------------------------------------------------ attestation */

const Side = z.strictObject({
  runScoresBp: z.array(Bp).min(3).max(99),
  taskMeansBp: z.record(TaskId, Bp),
});
const Call = z.enum(['gain', 'loss', 'noise']);

export const AttestationBody = z.strictObject({
  type: z.literal('attestation'),
  v: z.literal(1),
  tree: TreeName,
  change: Hex64,
  parentBuild: Hex64,
  build: Hex64,
  suite: Hex64,
  mode: z.enum(['replay', 'live']),
  runs: OddRuns,
  parent: Side,
  candidate: Side,
  effectBp: SignedBp,
  ciLowBp: SignedBp,
  ciHighBp: SignedBp,
  call: Call,
  resultsDigest: Hex64,
  clean: z.boolean(),
  notes: z.array(z.string().max(200)).max(10),
  spotCheck: z.strictObject({
    tasks: z.array(TaskId).min(1).max(8),
    recordedBp: Bp,
    liveBp: Bp,
    ok: z.boolean(),
  }).nullable(),
  sealed: z.strictObject({
    suite: Hex64,
    runs: OddRuns,
    effectBp: SignedBp,
    ciLowBp: SignedBp,
    ciHighBp: SignedBp,
    call: Call,
  }).nullable(),
  env: z.strictObject({
    model: z.string().max(96),
    engine: z.string().max(64),
    node: z.string().max(32),
    platform: z.string().max(32),
  }),
  signer: Addr,
  createdAt: Iso,
}).superRefine((a, ctx) => {
  if (a.parent.runScoresBp.length !== a.runs || a.candidate.runScoresBp.length !== a.runs) {
    ctx.addIssue({ code: 'custom', message: 'runScoresBp must have exactly `runs` entries on both sides' });
  }
  const pk = Object.keys(a.parent.taskMeansBp).sort().join('|');
  const ck = Object.keys(a.candidate.taskMeansBp).sort().join('|');
  if (pk !== ck) ctx.addIssue({ code: 'custom', message: 'both sides must cover the same tasks' });
  if (a.ciLowBp > a.ciHighBp) ctx.addIssue({ code: 'custom', message: 'ciLowBp is above ciHighBp' });
});
export type AttestationBody = z.infer<typeof AttestationBody>;

/* ------------------------------------------------------------------ receipt */

export const ReceiptBody = z.strictObject({
  type: z.literal('receipt'),
  v: z.literal(1),
  record: Hex64,
  network: z.enum(['testnet', 'public']),
  tx: Hex64,
  ledger: z.int().min(0),
  closedAt: Iso,
  account: Addr,
});
export type ReceiptBody = z.infer<typeof ReceiptBody>;

/* ------------------------------------------------------------------ union + envelope */

export const SIGNED_TYPES = ['change', 'attestation'] as const;
export const UNSIGNED_TYPES = ['build', 'recording', 'receipt'] as const;
export type RecordType = (typeof SIGNED_TYPES)[number] | (typeof UNSIGNED_TYPES)[number];

const BODY_SCHEMAS = {
  build: BuildBody,
  recording: RecordingBody,
  receipt: ReceiptBody,
  change: ChangeBody,
  attestation: AttestationBody,
} as const;

export type BodyOf<T extends RecordType> = z.infer<(typeof BODY_SCHEMAS)[T]>;

/** A validated record, ready to store or use. `sig` is present exactly for signed types. */
export type StoredRecord =
  | { id: string; type: 'build'; body: BuildBody }
  | { id: string; type: 'recording'; body: RecordingBody }
  | { id: string; type: 'receipt'; body: ReceiptBody }
  | { id: string; type: 'change'; body: ChangeBody; sig: string }
  | { id: string; type: 'attestation'; body: AttestationBody; sig: string };

export type ParseResult =
  | { ok: true; record: StoredRecord }
  | { ok: false; stage: 'shape' | 'schema' | 'signature'; reason: string };

const isSigned = (t: string): t is (typeof SIGNED_TYPES)[number] => (SIGNED_TYPES as readonly string[]).includes(t);

function describeIssues(error: z.ZodError): string {
  return error.issues
    .slice(0, 4)
    .map((i) => `${i.path.length > 0 ? i.path.join('.') : '(body)'}: ${i.message}`)
    .join('; ');
}

/**
 * Validate a record file's content: its shape, then its schema, then (for signed types) its
 * signature. The id is computed from the body. Never throws on bad input.
 *
 * Checking that the id equals the file name is the store's job.
 */
export function parseRecord(value: unknown): ParseResult {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    return { ok: false, stage: 'shape', reason: 'not an object' };
  }
  const { body, sig, ...rest } = value as { body?: unknown; sig?: unknown };
  if (Object.keys(rest).length > 0) return { ok: false, stage: 'shape', reason: `unknown key "${Object.keys(rest)[0]}"` };
  if (body === null || typeof body !== 'object' || Array.isArray(body)) {
    return { ok: false, stage: 'shape', reason: 'no body' };
  }
  const type = (body as { type?: unknown }).type;
  if (typeof type !== 'string' || !(type in BODY_SCHEMAS)) {
    return { ok: false, stage: 'shape', reason: `unknown record type ${JSON.stringify(type)}` };
  }
  const schema = BODY_SCHEMAS[type as RecordType];
  const parsed = schema.safeParse(body);
  if (!parsed.success) return { ok: false, stage: 'schema', reason: describeIssues(parsed.error) };

  let id: string;
  try {
    id = idOf(parsed.data);
  } catch (err) {
    return { ok: false, stage: 'schema', reason: err instanceof Error ? err.message : 'body cannot be encoded' };
  }

  if (isSigned(type)) {
    if (!Hex128.safeParse(sig).success) return { ok: false, stage: 'signature', reason: 'missing or malformed sig' };
    const checked = checkSignature({ body: parsed.data, sig });
    if (!checked.ok) return { ok: false, stage: 'signature', reason: checked.reason };
    return { ok: true, record: { id, type, body: parsed.data, sig: sig as string } as StoredRecord };
  }
  if (sig !== undefined) return { ok: false, stage: 'shape', reason: `${type} records are not signed` };
  return { ok: true, record: { id, type, body: parsed.data } as StoredRecord };
}

/** The envelope that is written to disk for a record. */
export function envelopeOf(record: StoredRecord): { body: unknown; sig?: string } {
  return 'sig' in record ? { body: record.body, sig: record.sig } : { body: record.body };
}

/** Wrap a body (and signature) as a record, computing its id. Throws if it does not validate. */
export function toRecord(body: unknown, sig?: string): StoredRecord {
  const parsed = parseRecord(sig === undefined ? { body } : { body, sig });
  if (!parsed.ok) throw new Error(`invalid ${(body as { type?: string })?.type ?? 'record'}: ${parsed.reason}`);
  return parsed.record;
}
