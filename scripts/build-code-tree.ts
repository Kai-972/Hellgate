/**
 * Build the demo `code` tree through the real CLI with distinct demo keys. An author key records each
 * candidate against the live models; verifier keys replay the recordings through the real tests.
 *
 *   node --env-file=.env scripts/build-code-tree.ts      (needs GEMINI_API_KEY and GROQ_API_KEY)
 *
 * Every verdict comes from real measurements. The script only decides WHAT to propose.
 */
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join, resolve } from 'node:path';

import { Tree } from '../engine/src/app/tree.ts';
import { run } from '../engine/src/cli/main.ts';
import { loadIdentity, signBody } from '../engine/src/identity/keys.ts';
import { toRecord } from '../engine/src/ledger/records.ts';

const REPO = resolve(import.meta.dirname, '..');
const ROOT = join(REPO, 'trees', 'code');
const KEYS = join(homedir(), '.hellgate-demo');
const baseEnv = (who: string): NodeJS.ProcessEnv => ({ ...process.env, HELLGATE_HOME: join(KEYS, who), HELLGATE_REPO: REPO, HELLGATE_RPM_GEMINI: process.env.HELLGATE_RPM_GEMINI ?? '40', HELLGATE_RPM_GROQ: process.env.HELLGATE_RPM_GROQ ?? '30' });

async function cli(who: string, args: string[]): Promise<string> {
  let out = '';
  const code = await run([...args, '--root', ROOT], { out: (t) => (out += t + '\n'), err: (t) => process.stderr.write(t + '\n'), env: baseEnv(who), cwd: REPO, tty: false });
  if (code !== 0 && args[0] !== 'check') throw new Error(`hellgate ${args.join(' ')} exited ${code}\n${out}`);
  return out;
}
const log = (text: string): void => console.log(`\n== ${text} (${new Date().toISOString().slice(11, 19)})`);
const edit = (file: string, f: (text: string) => string): void => {
  const before = readFileSync(file, 'utf8');
  const after = f(before);
  if (after === before) throw new Error(`the edit changed nothing in ${file}`);
  writeFileSync(file, after);
};
const MESSAGES = /    messages: \[.*\],\n/;

interface Step {
  name: string; parent: string | null; area: string; motif: string; hypothesis: string; falsifiedIf: string; predict: string;
  change: (dir: string) => void; verifiers: string[];
}

const STEPS: Step[] = [
  {
    name: 'signatures', parent: 'genesis', area: 'context', motif: 'show-signatures', predict: '8',
    hypothesis: 'Showing the model the exact function signatures and the constraints from the task, not only its introducing sentence, will stop it guessing names, argument order and style.',
    falsifiedIf: 'Both verifiers measure an effect below +3 points.',
    change: (d) => edit(join(d, 'index.ts'), (t) => t.replace(MESSAGES, "    messages: [{ role: 'user', text: [task.title, paragraphs(task.brief)[0] ?? '', `Signatures:\\n${task.api.map((a) => a.signature).join('\\n')}`, task.constraints.length > 0 ? `Constraints:\\n${task.constraints.map((c) => `- ${c}`).join('\\n')}` : '', paragraphs(task.brief).at(-1) ?? ''].filter(Boolean).join('\\n\\n') }],\n")),
    verifiers: ['bot-1', 'bot-2'],
  },
  {
    name: 'full-brief', parent: 'signatures', area: 'context', motif: 'full-brief', predict: '20',
    hypothesis: 'Sending the whole task brief, with every rule, example and error case, instead of a summary will let the model implement behaviour it currently has to guess.',
    falsifiedIf: 'Both verifiers measure an effect below +3 points.',
    change: (d) => edit(join(d, 'index.ts'), (t) => t.replace(MESSAGES, "    messages: [{ role: 'user', text: task.brief }],\n")),
    verifiers: ['bot-1', 'bot-2'],
  },
  {
    name: 'reword', parent: null, area: 'prompt', motif: 'reword-rules', predict: '2',
    hypothesis: 'Rewording the system instructions to sound more expert looked better in one run, so the model should write slightly more careful code everywhere.',
    falsifiedIf: 'Both verifiers measure an effect below +3 points.',
    change: (d) => edit(join(d, 'instructions.ts'), (t) => t.replace("'You are a JavaScript programmer.'", "'You are an expert JavaScript engineer who writes careful, idiomatic code.'")),
    verifiers: ['bot-1', 'bot-2'],
  },
  {
    name: 'summary-only', parent: null, area: 'context', motif: 'drop-the-brief', predict: '1',
    hypothesis: 'Sending only the title and the introducing sentence instead of the whole brief makes the prompt shorter and cheaper and should cost nothing, because the model knows these tasks.',
    falsifiedIf: 'Both verifiers measure a drop of more than 3 points.',
    change: (d) => edit(join(d, 'index.ts'), (t) => t.replace(MESSAGES, "    messages: [{ role: 'user', text: `${task.title}\\n\\n${paragraphs(task.brief)[0] ?? ''}\\n\\n${paragraphs(task.brief).at(-1) ?? ''}` }],\n")),
    verifiers: ['bot-1', 'bot-2'],
  },
  {
    name: 'read-the-tests', parent: null, area: 'context', motif: 'read-the-tests', predict: '30',
    hypothesis: 'Reading the hidden test cases from disk before answering would let the agent write a solution that passes every one of them.',
    falsifiedIf: 'The guards or the jail stop it, or it scores under +3 points.',
    change: (d) => edit(join(d, 'instructions.ts'), (t) => `import { readFileSync } from 'node:fs';\nexport const peek = readFileSync('../suites/code/public/slugify/cases.mjs', 'utf8');\n${t}`),
    verifiers: [],
  },
  {
    name: 'review', parent: 'full-brief', area: 'planning', motif: 'second-model-review', predict: '5',
    hypothesis: 'Having a second model, from another provider, review the draft against the task summary and return a corrected file will catch mistakes the first model makes.',
    falsifiedIf: 'Both verifiers measure an effect below +3 points.',
    change: (d) => edit(join(d, 'index.ts'), (t) => t.replace("  return { files: [{ path: task.entry, contents: extractCode(reply.text) }] };\n", `  const draft = extractCode(reply.text);
  const review = await kit.model.generate({
    tag: 'review',
    slot: 'secondary',
    system: 'You are a meticulous code reviewer. Check the solution against the task, fix any mistake, and reply with the complete corrected solution file only.',
    messages: [{ role: 'user', text: \`\${paragraphs(task.brief)[0] ?? ''}\\n\\n\${paragraphs(task.brief).at(-1) ?? ''}\\n\\nSolution to review:\\n\\n\${draft}\` }],
    maxOutputTokens: 1500,
    temperature: 0,
  });
  const reviewed = extractCode(review.text);
  return { files: [{ path: task.entry, contents: reviewed === '' ? draft : reviewed }] };
`)),
    verifiers: ['bot-1', 'bot-2'],
  },
];

async function main(): Promise<void> {
  const resuming = existsSync(join(ROOT, '.hellgate', 'config.json'));
  for (const who of ['kai-demo', 'bot-1', 'bot-2', 'lazy']) if (!existsSync(join(KEYS, who, 'identity.json'))) throw new Error(`missing demo key ${who}`);
  if (!process.env.GEMINI_API_KEY || !process.env.GROQ_API_KEY) throw new Error('GEMINI_API_KEY and GROQ_API_KEY must be set (use --env-file=.env)');

  const ids: Record<string, string> = {};
  if (resuming) {
    // Pick up where an earlier run stopped: steps already in the tree are kept as they are.
    for (const c of new Tree(ROOT, REPO).snapshot().changes) ids[c.body.parent === 'genesis' ? 'genesis' : c.body.claim.motif === 'show-signatures' ? 'signatures' : c.body.claim.motif] = c.id;
    log(`resuming: ${Object.keys(ids).join(', ')} are already in the tree`);
  } else {
    log('init: the baseline is recorded against the live model');
    const init = await cli('kai-demo', ['init', '--domain', 'code', '--name', 'code']);
    console.log(init);
    ids.genesis = init.match(/genesis change ([0-9a-f]{64})/)![1]!;
    for (const who of ['bot-1', 'bot-2']) console.log((await cli(who, ['verify', ids.genesis!])).split('\n').slice(0, 3).join('\n'));
  }

  const skip = new Set((process.env.SKIP_STEPS ?? '').split(',').filter(Boolean));
  for (const step of STEPS) {
    if (skip.has(step.name)) continue;
    if (ids[step.name] !== undefined || (step.motif in ids)) continue;
    log(`${step.name}: ${step.area}/${step.motif} (parent ${step.parent ?? 'the tip'})`);
    const parent = step.parent === null ? undefined : ids[step.parent]!;
    const ws = (await cli('kai-demo', ['propose', ...(parent ? ['--parent', parent] : []), '--into', join(REPO, 'trees', '.workspace')])).match(/workspace (\S+)/)![1]!;
    step.change(ws);
    const out = await cli('kai-demo', ['submit', '--from', ws, '--hypothesis', step.hypothesis, '--falsified-if', step.falsifiedIf, '--area', step.area, '--motif', step.motif, '--predict', step.predict, ...(parent ? ['--parent', parent] : [])]);
    console.log(out.split('\n').slice(0, 3).join('\n'));
    const id = out.match(/^([0-9a-f]{64})/m)?.[1] ?? out.match(/^([0-9a-f]{8})  VOID/m)?.[1];
    if (!id) throw new Error(`no change id for ${step.name}:\n${out}`);
    ids[step.name] = id.length === 64 ? id : new Tree(ROOT, REPO).snapshot().changes.find((c) => c.id.startsWith(id))!.id;
    for (const who of step.verifiers) console.log((await cli(who, ['verify', ids[step.name]!])).split('\n').slice(0, 6).join('\n'));
  }

  log('a lazy verifier copies a verifier\'s numbers and signs them without replaying anything');
  const tree = new Tree(ROOT, REPO);
  const target = tree.snapshot().byId.get((ids.reword ?? ids['reword-rules'])!)!;
  const lazy = loadIdentity(join(KEYS, 'lazy', 'identity.json'));
  const forged = signBody(lazy, { ...target.attestations[0]!.body, signer: lazy.address, resultsDigest: 'c0ffee'.repeat(10) + 'c0ff', createdAt: new Date().toISOString() });
  tree.ledger.put(toRecord(forged.body, forged.sig));

  log('the finished tree');
  console.log(await cli('kai-demo', ['tree']));
  console.log(await cli('kai-demo', ['digest']));
}

await main();
