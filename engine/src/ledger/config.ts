/**
 * `<root>/.hellgate/config.json`: what pins a tree.
 *
 * It is plain, human-readable JSON and is never hashed or signed. It names the tree, its domain,
 * the suite it is measured on, the models behind the agent's slots, and the policy numbers the
 * verdict uses (ARCHITECTURE §10).
 */
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';

import { z } from 'zod';

import { compareCodePoints } from '../core/canonical.ts';
import { HellgateError } from '../core/errors.ts';
import { Addr, Hex64, ModelRef, TreeName } from './records.ts';
import { STATE_DIR } from './store.ts';

export const PolicySchema = z.strictObject({
  minVerifiers: z.int().min(2).max(8).default(2),
  runs: z.int().min(3).max(99).refine((n) => n % 2 === 1, 'must be odd').default(5),
  minEffectBp: z.int().min(1).max(10_000).default(300),
  bootstrap: z.int().min(200).max(20_000).default(2000),
  maxVerifierSpanBp: z.int().min(0).max(10_000).default(600),
  spotCheckTasks: z.int().min(0).max(16).default(3),
  spotCheckToleranceBp: z.int().min(0).max(10_000).default(2500),
  allowedVerifiers: z.array(Addr).max(64).default([]),
});
export type Policy = z.infer<typeof PolicySchema>;

export const ConfigSchema = z.strictObject({
  v: z.literal(1),
  tree: TreeName,
  domain: z.enum(['code', 'ml']),
  buildDir: z.enum(['agent', 'learner']),
  suite: Hex64,
  /** The model behind each slot. `null` for a domain with no model API. */
  models: z.strictObject({
    primary: ModelRef,
    secondary: ModelRef.nullable(),
    proposer: ModelRef.nullable(),
  }).nullable(),
  policy: PolicySchema,
}).superRefine((c, ctx) => {
  if (c.domain === 'code') {
    if (c.buildDir !== 'agent') ctx.addIssue({ code: 'custom', message: 'the code domain builds in agent/' });
    if (c.models === null) ctx.addIssue({ code: 'custom', message: 'the code domain needs models.primary' });
  } else {
    if (c.buildDir !== 'learner') ctx.addIssue({ code: 'custom', message: 'the ml domain builds in learner/' });
    if (c.models !== null) ctx.addIssue({ code: 'custom', message: 'the ml domain has no model API, so models must be null' });
  }
});
export type Config = z.infer<typeof ConfigSchema>;

/** The policy with every default filled in. */
export const defaultPolicy = (): Policy => PolicySchema.parse({});

export const configPath = (root: string): string => join(root, STATE_DIR, 'config.json');

export function loadConfig(root: string): Config {
  const path = configPath(root);
  if (!existsSync(path)) throw new HellgateError('not-found', `no tree at ${root}: ${path} is missing. Run \`hellgate init\` first.`);
  let value: unknown;
  try {
    value = JSON.parse(readFileSync(path, 'utf8'));
  } catch (err) {
    throw new HellgateError('integrity', `${path} is not valid JSON`, { cause: err });
  }
  const parsed = ConfigSchema.safeParse(value);
  if (!parsed.success) {
    const why = parsed.error.issues.slice(0, 3).map((i) => `${i.path.join('.') || '(config)'}: ${i.message}`).join('; ');
    throw new HellgateError('integrity', `${path} is not a valid config: ${why}`);
  }
  return parsed.data;
}

/** Validate, then write atomically with keys in a stable order, so a diff of the file stays small. */
export function saveConfig(root: string, config: unknown): Config {
  const parsed = ConfigSchema.safeParse(config);
  if (!parsed.success) {
    const why = parsed.error.issues.slice(0, 3).map((i) => `${i.path.join('.') || '(config)'}: ${i.message}`).join('; ');
    throw new HellgateError('usage', `refusing to write an invalid config: ${why}`);
  }
  const path = configPath(root);
  mkdirSync(dirname(path), { recursive: true });
  const tmp = `${path}.${process.pid}.tmp`;
  writeFileSync(tmp, `${JSON.stringify(sortKeys(parsed.data), null, 2)}\n`, { encoding: 'utf8', mode: 0o644 });
  renameSync(tmp, path);
  return parsed.data;
}

function sortKeys(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sortKeys);
  if (value !== null && typeof value === 'object') {
    const src = value as Record<string, unknown>;
    return Object.fromEntries(Object.keys(src).sort(compareCodePoints).map((k) => [k, sortKeys(src[k])]));
  }
  return value;
}
