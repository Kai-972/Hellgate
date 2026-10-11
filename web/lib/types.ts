// Types matching PROTOCOL §11 for the Hellgate export document

export type ChangeStatus = 'accepted' | 'rejected' | 'pending' | 'contested' | 'void';
export type ChangeCode =
  | 'GAIN'
  | 'NO_EFFECT'
  | 'REGRESSION'
  | 'NOT_CLEAN'
  | 'UNREPRODUCIBLE'
  | 'RESULTS_MISMATCH'
  | 'SPOT_CHECK_FAILED'
  | 'CONFLICT'
  | 'NEEDS_VERIFIERS'
  | 'VERIFIERS_DISAGREE'
  | string; // guard names for void changes

export type Domain = 'code' | 'ml';
export type Origin = 'human' | 'agent' | 'challenge';
export type VerifierCall = 'gain' | 'loss' | 'noise';

export interface SuiteGroup {
  id: string;
  name: string;
  tasks: string[];
}

export interface Suite {
  id: string;
  tasks: number;
  cases: number;
  groups: SuiteGroup[];
}

export interface Models {
  primary: string | null;
  secondary: string | null;
  proposer: string | null;
  [key: string]: string | null | undefined;
}

export interface Base {
  change: string;
  scoreBp: number;
}

export interface Policy {
  minVerifiers: number;
  runs: number;
  minEffectBp: number;
  bootstrap: number;
  maxVerifierSpanBp: number;
  spotCheckTasks: number;
  spotCheckToleranceBp: number;
  allowedVerifiers: string[];
}

export interface Totals {
  changes: number;
  accepted: number;
  rejected: number;
  pending: number;
  contested: number;
  void: number;
}

export interface CurvePoint {
  change: string;
  depth: number;
  scoreBp: number;
  vsBaseBp: number;
}

export interface Claim {
  hypothesis: string;
  falsifiedIf: string;
  area: string;
  motif: string;
  predictedEffectBp: number;
  contradicts: string[];
  whyThisTime: string | null;
}

export interface ChangeOrigin {
  by: Origin;
  model: string | null;
  promptHash: string | null;
  instruction: string | null;
}

export interface Mechanical {
  status: string;
  detail: string;
}

export interface ClaimedResult {
  runs: number;
  effectBp: number;
  resultsDigest: string;
}

export interface PerTask {
  task: string;
  group: string;
  parentBp: number;
  candidateBp: number;
}

export interface PerGroup {
  group: string;
  parentBp: number;
  candidateBp: number;
}

export interface SpotCheck {
  tasks: string[];
  recordedBp: number;
  liveBp: number;
  ok: boolean;
}

export interface Attestation {
  id: string;
  signer: string;
  counted: boolean;
  why: string | null;
  mode: string;
  call: VerifierCall;
  effectBp: number;
  ciLowBp: number;
  ciHighBp: number;
  parentRunsBp: number[];
  candidateRunsBp: number[];
  resultsDigest: string;
  spotCheck: SpotCheck | null;
  sealed: string | null;
  receipt: string | null;
}

export interface Tokens {
  candidateMedian: number;
  parentMedian: number;
}

export interface Change {
  id: string;
  parent: string;
  depth: number;
  status: ChangeStatus;
  code: ChangeCode;
  reason: string;
  effectBp: number | null;
  ciLowBp: number | null;
  ciHighBp: number | null;
  scoreBp: number | null;
  vsBaseBp: number | null;
  slots: string[];
  claim: Claim;
  origin: ChangeOrigin;
  mechanical: Mechanical;
  claimed: ClaimedResult | null;
  author: string;
  createdAt: string;
  diff: string | null;
  perTask: PerTask[];
  perGroup: PerGroup[];
  attestations: Attestation[];
  receipt: string | null;
  tokens: Tokens | null;
}

export interface Verifier {
  address: string;
  label: string | null;
  attestations: number;
  counted: number;
  flags: string[];
  stellarLink: string | null;
}

export interface HellgateExport {
  protocol: string;
  tree: string;
  domain: Domain;
  suite: Suite;
  sealed: string | null;
  models: Models | null;
  base: Base;
  policy: Policy;
  totals: Totals;
  gatePath: string[];
  curve: CurvePoint[];
  changes: Change[];
  verifiers: Verifier[];
  digest: string | null;
}

export interface Tree {
  name: string;
  domain: Domain;
  totals: Totals;
}

// Job event types
export type JobEventType = 'stage' | 'progress' | 'attestation' | 'change' | 'done' | 'error' | 'log';

export interface StageEvent {
  type: 'stage';
  stage: string;
}

export interface ProgressEvent {
  type: 'progress';
  done: number;
  of: number;
  tasks?: Array<{ task: string; run: number; passedCases: number; cases: number }>;
}

export interface AttestationEvent {
  type: 'attestation';
  attestation: Attestation;
}

export interface ChangeEvent {
  type: 'change';
  status: ChangeStatus;
  code: ChangeCode;
}

export interface DoneEvent {
  type: 'done';
  changeId: string;
  status: ChangeStatus;
  code: ChangeCode;
  reason: string;
  effectBp: number | null;
}

export interface ErrorEvent {
  type: 'error';
  message: string;
}

export interface LogEvent {
  type: 'log';
  message: string;
}

export type JobEvent =
  | StageEvent
  | ProgressEvent
  | AttestationEvent
  | ChangeEvent
  | DoneEvent
  | ErrorEvent
  | LogEvent;

// Helper to format basis points as signed points
export function formatBp(bp: number | null | undefined): string {
  if (bp === null || bp === undefined) return '—';
  const pts = bp / 100;
  const sign = pts >= 0 ? '+' : '−';
  return `${sign}${Math.abs(pts).toFixed(1)} pts`;
}

// Format bp as a percentage score
export function formatScore(bp: number | null | undefined): string {
  if (bp === null || bp === undefined) return '—';
  const pct = bp / 100;
  return `${pct.toFixed(1)}%`;
}

// Short address display
export function shortAddr(addr: string): string {
  if (!addr) return '';
  return `${addr.slice(0, 6)}…${addr.slice(-4)}`;
}

// Short id display
export function shortId(id: string): string {
  if (!id) return '';
  return id.slice(0, 12);
}
