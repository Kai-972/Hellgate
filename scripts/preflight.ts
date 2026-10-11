/**
 * Before a demo: check everything the demo leans on and say what is missing.
 *
 *   pnpm preflight            checks that need no network
 *   pnpm preflight --probe    also asks Gemini and Groq one tiny question each (needed for Beat the gate)
 */
import { existsSync } from 'node:fs';
import { homedir } from 'node:os';
import { join, resolve } from 'node:path';

import { Tree } from '../engine/src/app/tree.ts';

const REPO = resolve(import.meta.dirname, '..');
let bad = 0;
const line = (ok: boolean | null, text: string): void => {
  console.log(`${ok === null ? ' - ' : ok ? ' ✓ ' : ' ✗ '} ${text}`);
  if (ok === false) bad++;
};

line(Number(process.versions.node.split('.')[0]) >= 22, `Node ${process.versions.node} (needs 22.18 or newer)`);
line(existsSync(join(REPO, 'node_modules')), 'dependencies installed (pnpm install)');
line(existsSync(join(REPO, 'web', '.next')), 'web app built (pnpm -C web build)');
const keys = join(process.env.HELLGATE_DEMO_KEYS ?? join(homedir(), '.hellgate-demo'));
line(null, `demo keys live in ${keys}; the hub creates the ones it needs`);

for (const name of ['ml', 'code']) {
  try {
    const tree = new Tree(join(REPO, 'trees', name), REPO);
    const snap = tree.snapshot();
    const by = (s: string): number => snap.changes.filter((c) => c.verdict.status === s).length;
    line(snap.problems.length === 0, `tree ${name}: ${snap.changes.length} changes, ${by('accepted')} accepted, ${by('rejected')} rejected, ${by('pending')} pending, ${by('contested')} contested, ${by('void')} void`);
    for (const p of snap.problems.slice(0, 3)) line(false, `  ${p}`);
  } catch (err) {
    line(false, `tree ${name}: ${err instanceof Error ? err.message : String(err)}`);
  }
}

const gemini = process.env.GEMINI_API_KEY;
const groq = process.env.GROQ_API_KEY;
line(gemini ? true : null, gemini ? 'GEMINI_API_KEY is set' : 'GEMINI_API_KEY is not set: Beat the gate cannot record (viewing and verifying still work)');
line(groq ? true : null, groq ? 'GROQ_API_KEY is set' : 'GROQ_API_KEY is not set (only needed by changes that use a second model)');
line(process.env.HELLGATE_HUB_TOKEN ? true : null, process.env.HELLGATE_HUB_TOKEN ? 'HELLGATE_HUB_TOKEN is set' : 'HELLGATE_HUB_TOKEN is not set: the hub will use "dev-token" (fine on this laptop)');

if (process.argv.includes('--probe')) {
  if (gemini) {
    const res = await fetch('https://generativelanguage.googleapis.com/v1beta/models/gemini-3.1-flash-lite:generateContent', {
      method: 'POST', headers: { 'content-type': 'application/json', 'x-goog-api-key': gemini }, body: JSON.stringify({ contents: [{ parts: [{ text: 'Reply with the word ok.' }] }] }),
    });
    const body = (await res.json().catch(() => ({}))) as { error?: { message?: string } };
    line(res.ok, res.ok ? 'Gemini answers (the key has quota left)' : `Gemini refused: ${(body.error?.message ?? '').split('\n')[0]!.slice(0, 160)}`);
  }
  if (groq) {
    const res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST', headers: { 'content-type': 'application/json', authorization: `Bearer ${groq}` }, body: JSON.stringify({ model: 'openai/gpt-oss-120b', messages: [{ role: 'user', content: 'Reply with the word ok.' }], max_tokens: 16 }),
    });
    line(res.ok, res.ok ? 'Groq answers' : `Groq refused (${res.status})`);
  }
}
console.log(bad === 0 ? '\nReady.' : `\n${bad} problem(s) above.`);
process.exitCode = bad === 0 ? 0 : 1;
