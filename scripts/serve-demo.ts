/**
 * Run the hub for the demo: both trees, with the demo keys in place so verify and Beat the gate jobs work.
 *
 *   pnpm hub:demo            (reads .env for GEMINI_API_KEY and GROQ_API_KEY, and HELLGATE_HUB_TOKEN)
 *
 * The verifier keys (bot-1, bot-2) and the challenge author key live in ~/.hellgate-demo, or in
 * HELLGATE_DEMO_KEYS. Missing ones are created. Nothing here is a secret of the repository: they are
 * ordinary keys, and the trees only ever contain their public addresses.
 */
import { existsSync } from 'node:fs';
import { homedir } from 'node:os';
import { join, resolve } from 'node:path';

import { run } from '../engine/src/cli/main.ts';
import { createIdentityFile, loadIdentity } from '../engine/src/identity/keys.ts';

const REPO = resolve(import.meta.dirname, '..');
const KEYS = process.env.HELLGATE_DEMO_KEYS ?? join(homedir(), '.hellgate-demo');
const secretOf = (who: string): string => {
  const path = join(KEYS, who, 'identity.json');
  if (!existsSync(path)) createIdentityFile(path, `demo-${who}`);
  return loadIdentity(path).secret;
};

const token = process.env.HELLGATE_HUB_TOKEN ?? 'dev-token';
if (process.env.HELLGATE_HUB_TOKEN === undefined) console.error('HELLGATE_HUB_TOKEN is not set; using "dev-token" (fine on localhost only)');
const env: NodeJS.ProcessEnv = {
  ...process.env,
  HELLGATE_REPO: REPO,
  HELLGATE_HUB_TOKEN: token,
  HELLGATE_BOT_1_SECRET: secretOf('bot-1'),
  HELLGATE_BOT_2_SECRET: secretOf('bot-2'),
  HELLGATE_CHALLENGER_SECRET: secretOf('challenger'),
};
if (!env.GEMINI_API_KEY || !env.GROQ_API_KEY) console.error('GEMINI_API_KEY or GROQ_API_KEY is missing: verify jobs work, Beat the gate will fail when it records');

process.exitCode = await run(['serve', '--root', join(REPO, 'trees', 'ml'), '--root', join(REPO, 'trees', 'code'), ...process.argv.slice(2)], {
  out: (t) => console.log(t), err: (t) => console.error(t), env, cwd: REPO, tty: process.stderr.isTTY === true,
});
