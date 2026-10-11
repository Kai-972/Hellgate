import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

import { configPath, defaultPolicy, loadConfig, saveConfig } from './config.ts';
import { hex } from './testkit.ts';

const root = (): string => mkdtempSync(join(tmpdir(), 'hg-config-'));

const codeConfig = () => ({
  v: 1, tree: 'coding-agent', domain: 'code', buildDir: 'agent', suite: hex('suite'),
  models: { primary: 'gemini:gemini-3.1-flash-lite', secondary: 'groq:llama-3.3-70b-versatile', proposer: 'gemini:gemini-3.5-flash' },
  policy: defaultPolicy(),
});
const mlConfig = () => ({ ...codeConfig(), tree: 'optimizer', domain: 'ml', buildDir: 'learner', models: null });

test('the default policy matches the documented numbers', () => {
  assert.deepEqual(defaultPolicy(), {
    minVerifiers: 2, runs: 5, minEffectBp: 300, bootstrap: 2000, maxVerifierSpanBp: 600,
    spotCheckTasks: 3, spotCheckToleranceBp: 2500, allowedVerifiers: [],
  });
});

test('a config round-trips and is written with stable, sorted keys', () => {
  const r = root();
  const saved = saveConfig(r, codeConfig());
  assert.deepEqual(loadConfig(r), saved);
  const text = readFileSync(configPath(r), 'utf8');
  assert.ok(text.indexOf('"buildDir"') < text.indexOf('"domain"') && text.indexOf('"domain"') < text.indexOf('"policy"'));
  assert.ok(text.endsWith('\n'));
});

test('both domains validate, and each insists on its own build directory and models', () => {
  const r = root();
  saveConfig(r, mlConfig());
  assert.equal(loadConfig(r).models, null);
  assert.throws(() => saveConfig(r, { ...mlConfig(), buildDir: 'agent' }), /ml domain builds in learner/);
  assert.throws(() => saveConfig(r, { ...mlConfig(), models: codeConfig().models }), /models must be null/);
  assert.throws(() => saveConfig(r, { ...codeConfig(), buildDir: 'learner' }), /code domain builds in agent/);
  assert.throws(() => saveConfig(r, { ...codeConfig(), models: null }), /needs models.primary/);
});

test('an even run count, bad models and unknown keys are refused', () => {
  const r = root();
  assert.throws(() => saveConfig(r, { ...codeConfig(), policy: { ...defaultPolicy(), runs: 4 } }), /odd/);
  assert.throws(() => saveConfig(r, { ...codeConfig(), policy: { ...defaultPolicy(), minVerifiers: 1 } }), /invalid config/);
  assert.throws(() => saveConfig(r, { ...codeConfig(), models: { ...codeConfig().models, primary: 'openai:gpt' } }), /provider:model/);
  assert.throws(() => saveConfig(r, { ...codeConfig(), surprise: true }), /invalid config/);
});

test('loading reports a missing tree, broken JSON and an invalid file clearly', () => {
  const r = root();
  assert.throws(() => loadConfig(r), /hellgate init/);
  mkdirSync(join(r, '.hellgate'), { recursive: true });
  writeFileSync(configPath(r), '{ not json');
  assert.throws(() => loadConfig(r), /not valid JSON/);
  writeFileSync(configPath(r), JSON.stringify({ v: 1 }));
  assert.throws(() => loadConfig(r), /not a valid config/);
});
