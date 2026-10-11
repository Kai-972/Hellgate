import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

import { codeBrief, loadSuite, suiteIdOf } from './loader.ts';

const MARKER = 'HIDDEN-MARKER-7f3a9c';

const codeMeta = (id: string, over: object = {}) => JSON.stringify({
  id, title: 'A task title', group: 'strings', entry: 'solution.mjs',
  api: [{ name: 'f', signature: 'export function f(): void' }], constraints: [], timeoutMs: 2000, tags: [], ...over,
});

function codeSuite(tasks: Record<string, Record<string, string>>): string {
  const dir = mkdtempSync(join(tmpdir(), 'hg-suite-'));
  for (const [id, files] of Object.entries(tasks)) {
    for (const [rel, text] of Object.entries(files)) {
      const abs = join(dir, id, rel);
      mkdirSync(join(abs, '..'), { recursive: true });
      writeFileSync(abs, text);
    }
  }
  return dir;
}
const goodTask = (id: string, over: Record<string, string> = {}) => ({
  'task.json': codeMeta(id), 'brief.md': `# ${id}\nWrite f.\n`, 'cases.mjs': `export default [{ name: 'c', run: () => '${MARKER}' }];\n`, ...over,
});

test('the suite id is a frozen vector, sorted by task id, and independent of input order', () => {
  const t1 = { id: 't1', files: { 'a.txt': 'x\n' } };
  const t2 = { id: 't2', files: { 'b.txt': 'y\n' } };
  // Produced by a separate implementation (Python), not by this code.
  assert.equal(suiteIdOf([t1]), '7c67862c65699aa2ffb27836edc2686a17ad8a85db499d0d1e9b84ad7e49b62e');
  assert.equal(suiteIdOf([t1, t2]), 'f2936f19f48ccb662aa8dc4e28c52b1a45f81965bb09e956980716a1e96b7496');
  assert.equal(suiteIdOf([t2, t1]), suiteIdOf([t1, t2]));
});

test('every file counts, including the hidden tests, and a changed assertion is a different suite', () => {
  const a = loadSuite(codeSuite({ one: goodTask('one') }), 'code');
  const b = loadSuite(codeSuite({ one: goodTask('one', { 'cases.mjs': `export default [{ name: 'c', run: () => 'changed' }];\n` }) }), 'code');
  const c = loadSuite(codeSuite({ one: goodTask('one', { 'starter/notes.md': 'hint\n' }) }), 'code');
  assert.equal(a.id, loadSuite(codeSuite({ one: goodTask('one') }), 'code').id, 'deterministic');
  assert.notEqual(a.id, b.id);
  assert.notEqual(a.id, c.id);
});

test('line endings are normalised, so a checkout with CRLF has the same suite id', () => {
  const lf = loadSuite(codeSuite({ one: goodTask('one') }), 'code');
  const crlf = loadSuite(codeSuite({ one: goodTask('one', { 'brief.md': '# one\r\nWrite f.\r\n' }) }), 'code');
  assert.equal(lf.id, crlf.id);
});

test('dotfiles are ignored and groups keep the order they first appear in', () => {
  const dir = codeSuite({
    b: goodTask('b', { 'task.json': codeMeta('b', { group: 'parsing' }), '.DS_Store': 'junk' }),
    a: goodTask('a', { 'task.json': codeMeta('a', { group: 'strings' }) }),
    c: goodTask('c', { 'task.json': codeMeta('c', { group: 'parsing' }) }),
  });
  const s = loadSuite(dir, 'code');
  assert.deepEqual(s.tasks.map((t) => t.id), ['a', 'b', 'c']);
  assert.deepEqual(s.groups, [{ id: 'strings', tasks: ['a'] }, { id: 'parsing', tasks: ['b', 'c'] }]);
  assert.ok(!('.DS_Store' in s.tasks[1]!.files));
});

test('a broken suite is an error that names the task, never a silently smaller suite', () => {
  assert.throws(() => loadSuite('/nonexistent/suite/dir', 'code'), /cannot read the suite folder/);
  assert.throws(() => loadSuite(codeSuite({}), 'code'), /holds no tasks/);
  assert.throws(() => loadSuite(codeSuite({ one: { 'task.json': codeMeta('one'), 'brief.md': 'x\n' } }), 'code'), /task one is missing cases.mjs/);
  assert.throws(() => loadSuite(codeSuite({ one: goodTask('one', { 'task.json': '{ nope' }) }), 'code'), /task one: task.json is not valid JSON/);
  assert.throws(() => loadSuite(codeSuite({ one: goodTask('one', { 'task.json': codeMeta('one', { timeoutMs: 5 }) }) }), 'code'), /task one: task.json is invalid/);
  assert.throws(() => loadSuite(codeSuite({ one: goodTask('one', { 'task.json': codeMeta('different') }) }), 'code'), /holds a task whose id is "different"/);
  assert.throws(() => loadSuite(codeSuite({ one: goodTask('one', { 'task.json': codeMeta('one', { surprise: 1 }) }) }), 'code'), /invalid/);
});

test('a symbolic link inside a task is refused', () => {
  const dir = codeSuite({ one: goodTask('one') });
  symlinkSync('/etc/hostname', join(dir, 'one', 'link.txt'));
  assert.throws(() => loadSuite(dir, 'code'), /symbolic link/);
});

test('the brief shows the task and its starter files, and can never contain the hidden tests', () => {
  const dir = codeSuite({ one: goodTask('one', { 'starter/helper.mjs': 'export const x = 1;\n' }) });
  const suite = loadSuite(dir, 'code');
  const brief = codeBrief(suite.tasks[0]!);
  assert.equal(brief.id, 'one');
  assert.equal(brief.entry, 'solution.mjs');
  assert.deepEqual(brief.starter, [{ path: 'helper.mjs', contents: 'export const x = 1;\n' }]);
  assert.ok(brief.brief.includes('Write f.'));
  // The marker lives only in cases.mjs. It must not appear anywhere in what the agent receives.
  assert.ok(suite.tasks[0]!.files['cases.mjs']!.includes(MARKER));
  assert.equal(JSON.stringify(brief).includes(MARKER), false);
});

test('an ml suite needs task.json and data.mjs, and validates its kind-specific fields', () => {
  const meta = (over: object) => JSON.stringify({
    id: 'm', title: 'An ml task', kind: 'classification', group: 'g', features: 2, classes: 2,
    trainSize: 50, testSize: 50, budgetMs: 2000, tags: [], ...over,
  });
  const ok = codeSuite({ m: { 'task.json': meta({}), 'data.mjs': 'export function generate() {}\n' } });
  assert.equal(loadSuite(ok, 'ml').tasks.length, 1);
  assert.throws(() => loadSuite(codeSuite({ m: { 'task.json': meta({}) } }), 'ml'), /missing data.mjs/);
  const bad = (over: object) => codeSuite({ m: { 'task.json': meta(over), 'data.mjs': 'x\n' } });
  assert.throws(() => loadSuite(bad({ classes: undefined }), 'ml'), /needs `classes`/);
  assert.throws(() => loadSuite(bad({ kind: 'regression', classes: undefined }), 'ml'), /needs `tolerance`/);
  assert.throws(() => loadSuite(bad({ tolerance: 0.1 }), 'ml'), /only for regression/);
  assert.equal(loadSuite(bad({ kind: 'regression', classes: undefined, tolerance: 0.25 }), 'ml').tasks[0]!.meta.tolerance, 0.25);
});
