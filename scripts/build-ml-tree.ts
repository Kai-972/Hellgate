/**
 * Build the demo `ml` tree through the real CLI, with distinct demo keys, one step at a time.
 *
 *   node scripts/build-ml-tree.ts            (needs ~/.hellgate-demo/{kai-demo,bot-1,bot-2,lazy}/ keys)
 *
 * Every verdict in the tree comes from real measurements. The script only decides WHAT to propose; the
 * outcome of each proposal is whatever the verifiers find. Re-running it on an existing tree stops.
 */
import { copyFileSync, existsSync, readFileSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join, resolve } from 'node:path';

import { Tree } from '../engine/src/app/tree.ts';
import { run } from '../engine/src/cli/main.ts';
import { loadIdentity, signBody } from '../engine/src/identity/keys.ts';
import { toRecord } from '../engine/src/ledger/records.ts';

const REPO = resolve(import.meta.dirname, '..');
const ROOT = join(REPO, 'trees', 'ml');
const KEYS = join(homedir(), '.hellgate-demo');
const SCEN = (name: string, file: string): string => join(REPO, 'scenarios', 'ml', name, 'learner', file);

const as = (who: string): NodeJS.ProcessEnv => ({ HELLGATE_HOME: join(KEYS, who), HELLGATE_REPO: REPO, PATH: process.env.PATH });
async function cli(who: string, args: string[]): Promise<string> {
  let out = '';
  const code = await run([...args, '--root', ROOT], { out: (t) => (out += t + '\n'), err: (t) => process.stderr.write(t + '\n'), env: as(who), cwd: REPO, tty: false });
  if (code !== 0 && !(args[0] === 'check')) throw new Error(`hellgate ${args.join(' ')} exited ${code}\n${out}`);
  return out;
}
const log = (text: string): void => console.log(`\n== ${text}`);
const edit = (file: string, f: (text: string) => string): void => writeFileSync(file, f(readFileSync(file, 'utf8')));

interface Step {
  name: string;
  parent: string | null; // a step name, or null for "the tree's tip"
  area: string;
  motif: string;
  hypothesis: string;
  falsifiedIf: string;
  predict: string;
  change: (dir: string) => void;
  verifiers: string[];
  extra?: string[];
}

const STEPS: Step[] = [
  {
    name: 'standardise', parent: 'genesis', area: 'preprocessing', motif: 'standardise-features', predict: '15',
    hypothesis: 'Rescaling every input feature to mean 0 and standard deviation 1 lets one learning rate suit all of them, so the network trains on badly scaled data.',
    falsifiedIf: 'Both verifiers measure under +3 points, or the badly scaled use case does not improve.',
    change: (d) => copyFileSync(SCEN('standardise', 'prep.ts'), join(d, 'prep.ts')), verifiers: ['bot-1', 'bot-2'],
  },
  {
    name: 'momentum', parent: 'standardise', area: 'optimizer', motif: 'momentum', predict: '3',
    hypothesis: 'Carrying part of the previous step forward (momentum 0.9) smooths the noisy mini-batch gradients and speeds convergence within the epoch budget.',
    falsifiedIf: 'Both verifiers measure an effect under +3 points.',
    change: (d) => copyFileSync(SCEN('momentum', 'optim.ts'), join(d, 'optim.ts')), verifiers: ['bot-1', 'bot-2'],
  },
  {
    name: 'adam', parent: 'standardise', area: 'optimizer', motif: 'adam', predict: '8',
    hypothesis: 'Replacing plain SGD with Adam gives every parameter its own step size, which helps the underfit tasks converge within the same number of epochs.',
    falsifiedIf: 'Both verifiers measure an effect below +3 points.',
    change: (d) => {
      copyFileSync(SCEN('adam', 'optim.ts'), join(d, 'optim.ts'));
      edit(join(d, 'index.ts'), (t) => t.replace('const BASE_RATE = 0.05;', 'const BASE_RATE = 0.01;'));
    },
    verifiers: ['bot-1', 'bot-2'],
  },
  {
    name: 'balance', parent: 'adam', area: 'preprocessing', motif: 'balance-classes', predict: '5',
    hypothesis: 'Repeating the rows of rarer classes until every class is as common as the commonest stops the network ignoring them, which should lift only the imbalanced use case.',
    falsifiedIf: 'Both verifiers measure under +3 points overall, or the imbalanced use case does not improve.',
    change: (d) => {
      copyFileSync(SCEN('balance', 'balance.ts'), join(d, 'balance.ts'));
      edit(join(d, 'index.ts'), (t) => t
        .replace("import type { MlKit, MlTask, Predictions } from './contract.ts';", "import { balanceClasses } from './balance.ts';\nimport type { MlKit, MlTask, Predictions } from './contract.ts';")
        .replace('  const xs = task.train.x.map(transform);\n  const ys = task.train.y;\n', '  const { xs, ys } = balanceClasses(task.train.x.map(transform), task.train.y, task.kind);\n'));
    },
    verifiers: ['bot-1', 'bot-2'],
  },
  {
    name: 'lr-nudge', parent: null, area: 'optimizer', motif: 'lr-nudge', predict: '2',
    hypothesis: 'Raising the learning rate by ten percent looked slightly better in one run, so it should converge a little faster everywhere.',
    falsifiedIf: 'Both verifiers measure an effect under +3 points.',
    change: (d) => edit(join(d, 'index.ts'), (t) => t.replace(/const BASE_RATE = ([0-9.]+);/, (_, v: string) => `const BASE_RATE = ${(Number(v) * 1.1).toFixed(4).replace(/0+$/, '')};`)),
    verifiers: ['bot-1', 'bot-2'],
  },
  {
    name: 'lr-decay', parent: null, area: 'schedule', motif: 'cosine-decay', predict: '3',
    hypothesis: 'Shrinking the step size along a half cosine lets early steps explore and late steps settle, which usually improves the final fit.',
    falsifiedIf: 'Both verifiers measure an effect under +3 points.',
    change: (d) => copyFileSync(SCEN('lr-decay', 'schedule.ts'), join(d, 'schedule.ts')), verifiers: ['bot-1', 'bot-2'],
  },
  {
    name: 'drop-standardise', parent: null, area: 'preprocessing', motif: 'drop-standardisation', predict: '1',
    hypothesis: 'Removing the feature standardisation simplifies the learner and should cost nothing, because the network can learn to rescale on its own.',
    falsifiedIf: 'Both verifiers measure a drop of more than 3 points.',
    change: (d) => copyFileSync(join(REPO, 'learner', 'prep.ts'), join(d, 'prep.ts')), verifiers: ['bot-1', 'bot-2'],
  },
  {
    name: 'read-the-data', parent: null, area: 'preprocessing', motif: 'read-the-generator', predict: '30',
    hypothesis: 'Reading the task data generator from disk would let the learner know the true labels of the test points and score near 100 percent.',
    falsifiedIf: 'The guards or the jail stop it, or it scores under +3 points.',
    change: (d) => edit(join(d, 'prep.ts'), (t) => `import { readFileSync } from 'node:fs';\nexport const peek = readFileSync('../suites/ml/public/moons/data.mjs', 'utf8');\n${t}`),
    verifiers: [],
  },
  {
    name: 'epochs', parent: null, area: 'schedule', motif: 'longer-training', predict: '3',
    hypothesis: 'Training for 300 epochs instead of 200 gives the underfit tasks more steps to converge.',
    falsifiedIf: 'Both verifiers measure an effect under +3 points.',
    change: (d) => edit(join(d, 'index.ts'), (t) => t.replace('const EPOCHS = 200;', 'const EPOCHS = 300;')), verifiers: ['bot-1'],
  },
];

async function main(): Promise<void> {
  if (existsSync(join(ROOT, '.hellgate', 'config.json'))) throw new Error(`${ROOT} already holds a tree; delete it to rebuild`);
  for (const who of ['kai-demo', 'bot-1', 'bot-2', 'lazy']) if (!existsSync(join(KEYS, who, 'identity.json'))) throw new Error(`missing demo key ${who} in ${KEYS}`);

  log('init: the genesis change, signed by kai-demo');
  const init = await cli('kai-demo', ['init', '--domain', 'ml', '--name', 'ml']);
  console.log(init);
  const ids: Record<string, string> = { genesis: init.match(/genesis change ([0-9a-f]{64})/)![1]! };
  for (const who of ['bot-1', 'bot-2']) console.log((await cli(who, ['verify', ids.genesis!])).split('\n').slice(0, 3).join('\n'));

  for (const step of STEPS) {
    log(`${step.name}: ${step.area}/${step.motif} (parent ${step.parent ?? 'the tip'})`);
    const parent = step.parent === null ? undefined : ids[step.parent]!;
    const ws = (await cli('kai-demo', ['propose', ...(parent ? ['--parent', parent] : []), '--into', join(REPO, 'trees', '.workspace')])).match(/workspace (\S+)/)![1]!;
    step.change(ws);
    const out = await cli('kai-demo', ['submit', '--from', ws, '--hypothesis', step.hypothesis, '--falsified-if', step.falsifiedIf, '--area', step.area, '--motif', step.motif, '--predict', step.predict, ...(parent ? ['--parent', parent] : [])]);
    console.log(out.split('\n').slice(0, 3).join('\n'));
    const id = out.match(/^([0-9a-f]{64})/m)?.[1] ?? out.match(/^([0-9a-f]{8})  VOID/m)?.[1];
    if (!id) throw new Error(`could not read the change id for ${step.name}:\n${out}`);
    ids[step.name] = id.length === 64 ? id : new Tree(ROOT, REPO).snapshot().changes.find((c) => c.id.startsWith(id))!.id;
    for (const who of step.verifiers) console.log((await cli(who, ['verify', ids[step.name]!])).split('\n').slice(0, 6).join('\n'));
  }

  log('a lazy verifier copies a verifier\'s numbers and signs them without running anything');
  const tree = new Tree(ROOT, REPO);
  const target = tree.snapshot().byId.get(ids.epochs!)!;
  const honest = target.attestations[0]!;
  const lazy = loadIdentity(join(KEYS, 'lazy', 'identity.json'));
  const forged = signBody(lazy, { ...honest.body, signer: lazy.address, resultsDigest: 'c0ffee'.repeat(10) + 'c0ff', createdAt: new Date().toISOString() });
  tree.ledger.put(toRecord(forged.body, forged.sig));

  log('the finished tree');
  console.log(await cli('kai-demo', ['tree']));
  console.log(await cli('kai-demo', ['digest']));
}

await main();
