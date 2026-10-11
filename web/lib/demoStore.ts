import { HellgateExport, Tree, Change, Attestation } from './types';
import { readFileSync } from 'fs';
import path from 'path';

interface StoreState {
  exports: Record<string, HellgateExport>;
  trees: Tree[];
  versions: Record<string, number>;
  jobs: Record<string, {
    id: string;
    type: 'verify' | 'challenge';
    tree?: string;
    changeId?: string;
    bot?: string;
    instruction?: string;
  }>;
}

// Global in-memory singleton to persist across Route Handler invocations in Node dev/prod
declare global {
  // eslint-disable-next-line no-var
  var __HELLGATE_DEMO_STORE__: StoreState | undefined;
}

function loadInitialData(): StoreState {
  const cwd = process.cwd();
  const mockDir = path.join(cwd, 'mock');

  let codeExport: HellgateExport;
  let mlExport: HellgateExport;
  let trees: Tree[];

  try {
    codeExport = JSON.parse(readFileSync(path.join(mockDir, 'export.sample.json'), 'utf-8'));
    mlExport = JSON.parse(readFileSync(path.join(mockDir, 'export.ml.sample.json'), 'utf-8'));
    trees = JSON.parse(readFileSync(path.join(mockDir, 'trees.sample.json'), 'utf-8'));
  } catch {
    codeExport = { tree: 'coding-agent', domain: 'code', changes: [] } as unknown as HellgateExport;
    mlExport = { tree: 'optimizer', domain: 'ml', changes: [] } as unknown as HellgateExport;
    trees = [];
  }

  return {
    exports: {
      'coding-agent': codeExport,
      optimizer: mlExport,
    },
    trees,
    versions: {
      'coding-agent': 1,
      optimizer: 1,
    },
    jobs: {},
  };
}

function getStore(): StoreState {
  if (!globalThis.__HELLGATE_DEMO_STORE__) {
    globalThis.__HELLGATE_DEMO_STORE__ = loadInitialData();
  }
  return globalThis.__HELLGATE_DEMO_STORE__;
}

export function registerDemoJob(job: {
  id: string;
  type: 'verify' | 'challenge';
  tree?: string;
  changeId?: string;
  bot?: string;
  instruction?: string;
}): void {
  const store = getStore();
  store.jobs[job.id] = job;
}

export function getDemoJob(id: string) {
  const store = getStore();
  return store.jobs[id];
}

export function completeDemoJob(id: string): { changeId?: string } {
  const store = getStore();
  const job = store.jobs[id];
  if (!job) return {};

  const tree = job.tree ?? 'coding-agent';
  if (job.type === 'verify' && job.changeId) {
    verifyDemoChange(tree, job.changeId, job.bot ?? 'bot-2');
    delete store.jobs[id];
    return { changeId: job.changeId };
  } else if (job.type === 'challenge' && job.instruction) {
    const res = addDemoChallenge(tree, job.instruction);
    delete store.jobs[id];
    return { changeId: res.changeId };
  }

  delete store.jobs[id];
  return {};
}

export function getExport(treeName: string): HellgateExport | null {
  const store = getStore();
  const exp = store.exports[treeName] ?? store.exports['coding-agent'];
  return exp ? JSON.parse(JSON.stringify(exp)) : null;
}

export function getTrees(): Tree[] {
  const store = getStore();
  return JSON.parse(JSON.stringify(store.trees));
}

export function getVersion(treeName: string): number {
  const store = getStore();
  return store.versions[treeName] ?? 1;
}

export function bumpVersion(treeName: string): number {
  const store = getStore();
  store.versions[treeName] = (store.versions[treeName] ?? 1) + 1;
  return store.versions[treeName];
}

export function resetDemoStore(): void {
  globalThis.__HELLGATE_DEMO_STORE__ = loadInitialData();
}

/**
 * Seed additional rich changes into the tree to stress-test graphs:
 * - A new depth-3 accepted node extending the ScoreCurve
 * - A contested node with verifier dispute
 * - A human regression node in the graveyard
 */
export function seedRichDemoData(treeName: string = 'coding-agent'): { added: number; tree: HellgateExport } {
  const store = getStore();
  const exp = store.exports[treeName] ?? store.exports['coding-agent'];
  if (!exp) return { added: 0, tree: exp };

  const baseScore = exp.base.scoreBp;
  const currentHeadId = exp.gatePath[exp.gatePath.length - 1];
  const newHeadId = '7a19c3f089de4c12bc34567890abcdef1234567890abcdef1234567890abcdef';
  const contestedId = '3b81e2a901fc4e56ba78901234567890abcdef1234567890abcdef1234567890';
  const regressionId = 'e5f6a7b8c9d01234567890abcdef1234567890abcdef1234567890abcdef1234';

  // Check if already seeded
  if (exp.changes.some((c) => c.id === newHeadId)) {
    return { added: 0, tree: exp };
  }

  // 1. New Depth-3 Accepted Change (extends ScoreCurve from 78.6% to 84.2%)
  const newAccepted: Change = {
    id: newHeadId,
    parent: currentHeadId,
    depth: exp.gatePath.length,
    author: 'GBR52DEMO7A19C3F089DE4C12BC34567890ABCDEF1234567890ABCDEF',
    createdAt: new Date().toISOString(),
    slots: ['primary', 'secondary'],
    claim: {
      hypothesis: 'Iterative AST self-repair with scoped variable lookup eliminates off-by-one errors.',
      falsifiedIf: 'Accuracy gain on algorithmic tasks is less than +4.0 points across independent seeds.',
      area: 'logic',
      motif: 'ast-repair',
      predictedEffectBp: 600,
      contradicts: [],
      whyThisTime: null,
    },
    claimed: {
      runs: 5,
      effectBp: 580,
      resultsDigest: 'digest_demo_ast_01',
    },
    status: 'accepted',
    code: 'GAIN',
    reason: 'Both verifiers measured consistent gains (+5.6 and +5.8 pts) clearing the +3.0 pt noise band.',
    scoreBp: 8420,
    effectBp: 560,
    ciLowBp: 410,
    ciHighBp: 710,
    vsBaseBp: 8420 - baseScore,
    mechanical: {
      status: 'ok',
      detail: '',
    },
    origin: {
      by: 'agent',
      model: 'gemini-3.5-flash',
      promptHash: 'hash_demo_prompt_01',
      instruction: null,
    },
    attestations: [
      {
        id: 'att_demo_01',
        signer: 'GCX7DEMOBOT1A19C3F089DE4C12BC34567890ABCDEF1234567890ABCDEF',
        mode: 'replay',
        call: 'gain',
        effectBp: 560,
        ciLowBp: 410,
        ciHighBp: 710,
        parentRunsBp: [7800, 7860, 7900, 7820, 7880],
        candidateRunsBp: [8380, 8440, 8420, 8400, 8460],
        resultsDigest: 'digest_bot1_01',
        spotCheck: { tasks: ['levenshtein', 'token-bucket', 'ipv4-parse'], recordedBp: 8400, liveBp: 8400, ok: true },
        counted: true,
        why: 'Reproduced full test suite and passed spot check',
        sealed: null,
        receipt: 'tx_demo_ast_01',
      },
      {
        id: 'att_demo_02',
        signer: 'GDK8DEMOBOT2B20D4E190EF5D23CD45678901BCDEF2345678901BCDEF',
        mode: 'replay',
        call: 'gain',
        effectBp: 580,
        ciLowBp: 430,
        ciHighBp: 730,
        parentRunsBp: [7820, 7840, 7860, 7880, 7900],
        candidateRunsBp: [8400, 8420, 8440, 8420, 8480],
        resultsDigest: 'digest_bot2_01',
        spotCheck: { tasks: ['matrix-spiral', 'flatten-object', 'ipv4-parse'], recordedBp: 8420, liveBp: 8420, ok: true },
        counted: true,
        why: 'Clean independent replay with matching digest',
        sealed: null,
        receipt: 'tx_demo_ast_02',
      },
    ],
    perGroup: exp.suite.groups.map((g) => ({
      group: g.id,
      parentBp: 7860,
      candidateBp: 8420,
    })),
    perTask: [
      { task: 'levenshtein', group: 'algorithms', parentBp: 8000, candidateBp: 9000 },
      { task: 'token-bucket', group: 'algorithms', parentBp: 7500, candidateBp: 8500 },
      { task: 'flatten-object', group: 'collections', parentBp: 8000, candidateBp: 8800 },
      { task: 'matrix-spiral', group: 'collections', parentBp: 7200, candidateBp: 8200 },
      { task: 'ipv4-parse', group: 'parsing', parentBp: 8500, candidateBp: 9000 },
    ],
    diff: `--- a/agent/synthesize.ts\n+++ b/agent/synthesize.ts\n@@ -12,6 +12,12 @@\n+  // Validate AST nodes before emitting code\n+  const ast = parseTypescript(code);\n+  if (ast.hasErrors) {\n+    return repairAst(ast, context.scope);\n+  }\n   return code;`,
    receipt: null,
    tokens: null,
  };

  // 2. Contested Disputed Node
  const newContested: Change = {
    id: contestedId,
    parent: currentHeadId,
    depth: exp.gatePath.length,
    author: 'GAM3CONTES73D89DE4C12BC34567890ABCDEF1234567890ABCDEF',
    createdAt: new Date().toISOString(),
    slots: ['primary'],
    claim: {
      hypothesis: 'Aggressive token temperature sampling reduces timeout rates on complex recursive logic.',
      falsifiedIf: 'Non-deterministic completions cause verifier variance greater than 400 bp.',
      area: 'sampling',
      motif: 'speculative-temp',
      predictedEffectBp: 400,
      contradicts: [],
      whyThisTime: null,
    },
    claimed: {
      runs: 5,
      effectBp: 520,
      resultsDigest: 'digest_temp_01',
    },
    status: 'contested',
    code: 'VERIFIERS_DISAGREE',
    reason: 'Verifiers span 10.0 points apart: bot-1 measured +5.2 pts gain while bot-2 measured -4.8 pts regression.',
    scoreBp: 7800,
    effectBp: 20,
    ciLowBp: -480,
    ciHighBp: 520,
    vsBaseBp: 7800 - baseScore,
    mechanical: { status: 'ok', detail: '' },
    origin: { by: 'human', model: null, promptHash: null, instruction: null },
    attestations: [
      {
        id: 'att_contested_01',
        signer: 'GCX7DEMOBOT1A19C3F089DE4C12BC34567890ABCDEF1234567890ABCDEF',
        mode: 'replay',
        call: 'gain',
        effectBp: 520,
        ciLowBp: 210,
        ciHighBp: 830,
        parentRunsBp: [7860, 7860, 7860, 7860, 7860],
        candidateRunsBp: [8380, 8400, 8360, 8420, 8340],
        resultsDigest: 'digest_c1',
        spotCheck: null,
        counted: true,
        why: 'Measured gain',
        sealed: null,
        receipt: null,
      },
      {
        id: 'att_contested_02',
        signer: 'GDK8DEMOBOT2B20D4E190EF5D23CD45678901BCDEF2345678901BCDEF',
        mode: 'replay',
        call: 'loss',
        effectBp: -480,
        ciLowBp: -790,
        ciHighBp: -170,
        parentRunsBp: [7860, 7860, 7860, 7860, 7860],
        candidateRunsBp: [7380, 7350, 7400, 7360, 7390],
        resultsDigest: 'digest_c2',
        spotCheck: null,
        counted: true,
        why: 'Measured severe regression',
        sealed: null,
        receipt: null,
      },
    ],
    perGroup: [],
    perTask: [],
    diff: `--- a/agent/config.ts\n+++ b/agent/config.ts\n@@ -5,2 +5,2 @@\n-  temperature: 0.2\n+  temperature: 0.85`,
    receipt: null,
    tokens: null,
  };

  // 3. Graveyard Severe Regression Node
  const newRegression: Change = {
    id: regressionId,
    parent: currentHeadId,
    depth: exp.gatePath.length,
    author: 'GHU9REGRESS10N9DE4C12BC34567890ABCDEF1234567890ABCDEF',
    createdAt: new Date().toISOString(),
    slots: ['primary'],
    claim: {
      hypothesis: 'Drastic context truncation by deleting intermediate reasoning tokens improves inference speed.',
      falsifiedIf: 'Task solve rate drops on multi-step formatting problems.',
      area: 'prompt',
      motif: 'context-truncate',
      predictedEffectBp: 150,
      contradicts: [],
      whyThisTime: null,
    },
    claimed: {
      runs: 5,
      effectBp: 200,
      resultsDigest: 'digest_reg_01',
    },
    status: 'rejected',
    code: 'REGRESSION',
    reason: 'Measured drop of -18.4 points below baseline: cutting context destroys edge-case verification.',
    scoreBp: 6020,
    effectBp: -1840,
    ciLowBp: -2300,
    ciHighBp: -1380,
    vsBaseBp: 6020 - baseScore,
    mechanical: { status: 'ok', detail: '' },
    origin: { by: 'human', model: null, promptHash: null, instruction: null },
    attestations: [
      {
        id: 'att_reg_01',
        signer: 'GCX7DEMOBOT1A19C3F089DE4C12BC34567890ABCDEF1234567890ABCDEF',
        mode: 'replay',
        call: 'loss',
        effectBp: -1840,
        ciLowBp: -2300,
        ciHighBp: -1380,
        parentRunsBp: [7860, 7860, 7860, 7860, 7860],
        candidateRunsBp: [6020, 6000, 6050, 6010, 6020],
        resultsDigest: 'digest_reg_02',
        spotCheck: null,
        counted: true,
        why: 'Confirmed regression',
        sealed: null,
        receipt: null,
      },
    ],
    perGroup: [],
    perTask: [],
    diff: `--- a/agent/context.ts\n+++ b/agent/context.ts\n@@ -8,3 +8,1 @@\n-  return history.filter(isImportant);\n+  return history.slice(-1);`,
    receipt: null,
    tokens: null,
  };

  // Append new changes
  exp.changes.push(newAccepted, newContested, newRegression);
  exp.gatePath.push(newHeadId);
  exp.curve.push({
    change: newHeadId,
    depth: exp.gatePath.length - 1,
    scoreBp: 8420,
    vsBaseBp: 8420 - baseScore,
  });

  // Update totals
  exp.totals.changes += 3;
  exp.totals.accepted += 1;
  exp.totals.contested += 1;
  exp.totals.rejected += 1;

  // Update tree total in list
  const t = store.trees.find((x) => x.name === treeName);
  if (t) {
    t.totals = { ...exp.totals };
  }

  bumpVersion(treeName);
  return { added: 3, tree: exp };
}

/**
 * Handle live verifier run in demo mode: flips pending change to accepted
 */
export function verifyDemoChange(treeName: string = 'coding-agent', changeId: string, botName: string): boolean {
  const store = getStore();
  const exp = store.exports[treeName] ?? store.exports['coding-agent'];
  if (!exp) return false;

  const change = exp.changes.find((c) => c.id === changeId);
  if (!change) return false;

  const signerAddr = botName === 'bot-2'
    ? 'GDK8DEMOBOT2B20D4E190EF5D23CD45678901BCDEF2345678901BCDEF'
    : 'GCX7DEMOBOT1A19C3F089DE4C12BC34567890ABCDEF1234567890ABCDEF';

  const newAttestation: Attestation = {
    id: `att_live_${Date.now()}`,
    signer: signerAddr,
    mode: 'replay',
    call: 'gain',
    effectBp: change.claimed?.effectBp ?? 620,
    ciLowBp: (change.claimed?.effectBp ?? 620) - 150,
    ciHighBp: (change.claimed?.effectBp ?? 620) + 150,
    parentRunsBp: [7240, 7200, 7260, 7220, 7280],
    candidateRunsBp: [7860, 7820, 7880, 7840, 7900],
    resultsDigest: `digest_live_${Date.now()}`,
    spotCheck: { tasks: ['token-bucket'], recordedBp: 7860, liveBp: 7860, ok: true },
    counted: true,
    why: 'Replayed recorded runs on identical seeds',
    sealed: null,
    receipt: `tx_live_${Date.now()}`,
  };

  change.attestations.push(newAttestation);

  // If now has >= 2 verifiers, promote from pending to accepted!
  if (change.status === 'pending' && change.attestations.length >= 2) {
    change.status = 'accepted';
    change.code = 'GAIN';
    change.reason = 'Confirmed statistically meaningful improvement (+6.2 pts) across 2 distinct verifier keys.';
    change.scoreBp = 7860;
    change.effectBp = 620;
    change.ciLowBp = 470;
    change.ciHighBp = 770;
    change.vsBaseBp = 7860 - exp.base.scoreBp;

    if (!exp.gatePath.includes(change.id)) {
      exp.gatePath.push(change.id);
      exp.curve.push({
        change: change.id,
        depth: exp.gatePath.length - 1,
        scoreBp: change.scoreBp,
        vsBaseBp: change.vsBaseBp,
      });
    }

    exp.totals.pending = Math.max(0, exp.totals.pending - 1);
    exp.totals.accepted += 1;

    const t = store.trees.find((x) => x.name === treeName);
    if (t) t.totals = { ...exp.totals };
  }

  bumpVersion(treeName);
  return true;
}

/**
 * Handle new Beat the Gate challenge in demo mode
 */
export function addDemoChallenge(treeName: string = 'coding-agent', instruction: string): { changeId: string } {
  const store = getStore();
  const exp = store.exports[treeName] ?? store.exports['coding-agent'];
  const newId = '9f2c41e8' + Math.random().toString(16).substring(2).padEnd(56, '0');
  const parentId = exp.gatePath[exp.gatePath.length - 1];

  const newChallenge: Change = {
    id: newId,
    parent: parentId,
    depth: exp.gatePath.length,
    author: 'GCHALLENGEUSER' + Date.now(),
    createdAt: new Date().toISOString(),
    slots: ['primary'],
    claim: {
      hypothesis: `Challenge prompt: "${instruction.slice(0, 100)}"`,
      falsifiedIf: 'Measured score does not exceed parent baseline by minEffect threshold.',
      area: 'prompt',
      motif: 'user-challenge',
      predictedEffectBp: 200,
      contradicts: [],
      whyThisTime: null,
    },
    claimed: {
      runs: 5,
      effectBp: 140,
      resultsDigest: 'digest_user_chal',
    },
    status: 'rejected',
    code: 'NO_EFFECT',
    reason: 'Measured effect sits within the noise band (±3.0 pts). The 95% confidence interval crosses zero. Kept in Graveyard.',
    scoreBp: exp.curve[exp.curve.length - 1]?.scoreBp ?? exp.base.scoreBp,
    effectBp: 80,
    ciLowBp: -120,
    ciHighBp: 280,
    vsBaseBp: (exp.curve[exp.curve.length - 1]?.scoreBp ?? exp.base.scoreBp) - exp.base.scoreBp,
    mechanical: { status: 'ok', detail: '' },
    origin: {
      by: 'challenge',
      model: null,
      promptHash: null,
      instruction,
    },
    attestations: [
      {
        id: `att_chal_${Date.now()}`,
        signer: 'GCX7DEMOBOT1A19C3F089DE4C12BC34567890ABCDEF1234567890ABCDEF',
        mode: 'replay',
        call: 'noise',
        effectBp: 80,
        ciLowBp: -120,
        ciHighBp: 280,
        parentRunsBp: [7240, 7200, 7260, 7220, 7280],
        candidateRunsBp: [7320, 7280, 7340, 7300, 7360],
        resultsDigest: 'digest_chal_bot1',
        spotCheck: null,
        counted: true,
        why: 'Effect within noise band',
        sealed: null,
        receipt: null,
      },
    ],
    perGroup: [],
    perTask: [],
    diff: `--- a/agent/prompt.md\n+++ b/agent/prompt.md\n@@ -1,3 +1,4 @@\n+# Challenge instruction\n+${instruction}`,
    receipt: null,
    tokens: null,
  };

  exp.changes.push(newChallenge);
  exp.totals.changes += 1;
  exp.totals.rejected += 1;

  const t = store.trees.find((x) => x.name === treeName);
  if (t) t.totals = { ...exp.totals };

  bumpVersion(treeName);
  return { changeId: newId };
}
