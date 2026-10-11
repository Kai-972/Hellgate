#!/usr/bin/env node
/**
 * `hellgate`: the command line. A thin dispatcher: it parses arguments, calls the library, and prints.
 * `run` takes its streams and environment as arguments so tests can drive it without a subprocess.
 */
import { writeFileSync } from 'node:fs';
import { basename, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';

import { initTree, proposeWorkspace, submitChange, verifyChange } from '../app/actions.ts';
import { measureBuild } from '../app/measure.ts';
import { benchText, graveyardText, digestText, showText, statusText, treeText, type BenchRow } from '../app/report.ts';
import { Tree, readBuildDir, repoDir } from '../app/tree.ts';
import { EXIT_CODES, HellgateError, messageOf } from '../core/errors.ts';
import { buildExport } from '../export/build.ts';
import { Hub } from '../hub/server.ts';
import { pull, push } from '../hub/sync.ts';
import { createIdentityFile, identityPath, loadIdentity, resolveIdentity } from '../identity/keys.ts';
import { scoreAgainstBase } from '../measure/compare.ts';
import type { BatchEvent } from '../measure/batch.ts';

export interface Io {
  out: (text: string) => void;
  err: (text: string) => void;
  env: NodeJS.ProcessEnv;
  cwd: string;
  tty: boolean;
}

const HELP = `hellgate: proof for changes to an AI system

  init --domain ml [--name N] [--runs N]       create a tree and sign its genesis change
  id create | show                             your key and Stellar address
  propose [--parent C] [--into DIR]            a workspace holding the parent build, ready to edit
  submit --from DIR --hypothesis … --falsified-if … --area … --motif … --predict POINTS
         [--parent C] [--why-this-time …] [--contradicts CHANGE:WHY]
  bench [C | --dir DIR] [--vs C] [--runs N]    score a build against the base; signs nothing
  verify C                                     re-measure a change and sign what you found
  status [C] [--why] [--json]                  verdict, reason and what was ignored
  check C [--json]                             CI form: exit 0 accepted, 1 rejected, 2 pending
  tree | graveyard | show C | digest | export [--out FILE]
  serve [--root DIR]… [--port N] [--host H]     the hub (HELLGATE_HUB_TOKEN enables jobs; HELLGATE_BOT_1_SECRET, _2_ are the demo verifiers)
  pull [URL] | push [URL]                       copy the records the other side lacks (URL defaults to HELLGATE_HUB)

  --root DIR (any command) selects the tree; the default is the current folder.
  Exit codes: 0 ok · 1 rejected · 2 pending · 3 usage · 4 refused · 5 integrity · 6 environment`;

const points = (text: string | undefined, name: string): number => {
  const n = Number(text);
  if (text === undefined || !Number.isFinite(n) || n === 0) throw new HellgateError('usage', `${name} needs a non-zero number of points, such as 3 or -1.5`);
  return Math.round(n * 100);
};
const need = (value: string | undefined, flag: string): string => {
  if (value === undefined || value === '') throw new HellgateError('usage', `${flag} is required`);
  return value;
};

export async function run(argv: string[], io: Io): Promise<number> {
  try {
    return await dispatch(argv, io);
  } catch (err) {
    if (err instanceof HellgateError) {
      io.err(`hellgate: ${err.message}`);
      return err.exitCode;
    }
    io.err(`hellgate: internal error: ${err instanceof Error ? (err.stack ?? err.message) : messageOf(err)}`);
    return 70;
  }
}

async function dispatch(argv: string[], io: Io): Promise<number> {
  const [command, ...rest] = argv;
  if (command === undefined || command === 'help' || command === '--help' || command === '-h') {
    io.out(HELP);
    return EXIT_CODES.ok;
  }
  const { values, positionals } = parseArgs({
    args: rest,
    allowPositionals: true,
    options: {
      root: { type: 'string', multiple: true }, port: { type: 'string' }, host: { type: 'string' }, domain: { type: 'string' }, name: { type: 'string' }, runs: { type: 'string' }, parent: { type: 'string' },
      into: { type: 'string' }, from: { type: 'string' }, dir: { type: 'string' }, vs: { type: 'string' }, out: { type: 'string' },
      hypothesis: { type: 'string' }, 'falsified-if': { type: 'string' }, area: { type: 'string' }, motif: { type: 'string' },
      predict: { type: 'string' }, 'why-this-time': { type: 'string' }, contradicts: { type: 'string', multiple: true },
      why: { type: 'boolean' }, json: { type: 'boolean' },
    },
  });
  const roots = (values.root ?? ['.']).map((r) => resolve(io.cwd, r));
  const root = roots[0]!;
  const runsOption = values.runs === undefined ? undefined : Number(values.runs);
  if (runsOption !== undefined && (!Number.isInteger(runsOption) || runsOption < 3 || runsOption % 2 === 0)) throw new HellgateError('usage', '--runs must be an odd whole number, at least 3');

  let measured = 0;
  const onEvent = (_: BatchEvent): void => {
    measured++;
    if (io.tty) process.stderr.write(`\r  ${measured} task runs measured`);
  };
  const doneProgress = (): void => {
    if (io.tty && measured > 0) process.stderr.write('\r\x1b[K');
  };
  const repo = repoDir(io.env);
  const open = (): Tree => new Tree(root, repo);

  switch (command) {
    case 'id': {
      const sub = positionals[0];
      if (sub === 'create') {
        const file = createIdentityFile(identityPath(io.env));
        io.out(`created ${identityPath(io.env)}\naddress ${file.address}`);
      } else if (sub === 'show') {
        const id = loadIdentity(identityPath(io.env));
        io.out(`address ${id.address}\nlabel   ${id.label}`);
      } else throw new HellgateError('usage', 'usage: hellgate id create | show');
      return EXIT_CODES.ok;
    }

    case 'init': {
      const domain = values.domain ?? 'ml';
      if (domain !== 'ml' && domain !== 'code') throw new HellgateError('usage', '--domain must be ml or code');
      const { genesis } = await initTree({ root, domain, name: values.name ?? (basename(root).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'tree'), identity: resolveIdentity(io.env), repo, env: io.env, ...(runsOption ? { runs: runsOption } : {}), onEvent });
      doneProgress();
      io.out(`created tree at ${root}\ngenesis change ${genesis}\nNext: two other keys run \`hellgate verify ${genesis.slice(0, 8)}\`.`);
      return EXIT_CODES.ok;
    }

    case 'propose': {
      const { dir, parent } = proposeWorkspace(open(), values.parent, values.into);
      io.out(`workspace ${dir}\nbuilt from ${parent.id.slice(0, 8)} (${parent.body.claim.area}/${parent.body.claim.motif})\nEdit the files, then: hellgate submit --from ${dir} …`);
      return EXIT_CODES.ok;
    }

    case 'submit': {
      const tree = open();
      const files = readBuildDir(resolve(io.cwd, need(values.from, '--from')), tree.config.buildDir);
      const contradicts = (values.contradicts ?? []).map((entry) => {
        const at = entry.indexOf(':');
        if (at < 6) throw new HellgateError('usage', '--contradicts takes CHANGE:WHY');
        return { change: tree.find(tree.snapshot(), entry.slice(0, at)).id, why: entry.slice(at + 1) };
      });
      const result = await submitChange({
        tree, identity: resolveIdentity(io.env), env: io.env, files, ...(values.parent ? { parent: values.parent } : {}), ...(runsOption ? { runs: runsOption } : {}), onEvent,
        claim: {
          hypothesis: need(values.hypothesis, '--hypothesis'), falsifiedIf: need(values['falsified-if'], '--falsified-if'), area: need(values.area, '--area'),
          motif: need(values.motif, '--motif'), predictedEffectBp: points(values.predict, '--predict'), contradicts, whyThisTime: values['why-this-time'] ?? null,
        },
      });
      doneProgress();
      if (result.stopped !== null) {
        io.out(`${result.id.slice(0, 8)}  VOID  ${result.stopped.status}\n${result.stopped.detail}\nThe change never ran. It is stored in the graveyard with this reason.`);
        return EXIT_CODES.ok;
      }
      const c = result.change!;
      io.out(`${result.id}\nauthor measured ${c.body.claimed!.effectBp >= 0 ? '+' : '−'}${(Math.abs(c.body.claimed!.effectBp) / 100).toFixed(1)} points over ${c.body.claimed!.runs} runs. This is a claim, not evidence.\nNext: two other keys run \`hellgate verify ${result.id.slice(0, 8)}\`.`);
      return EXIT_CODES.ok;
    }

    case 'verify': {
      const tree = open();
      const { row } = await verifyChange({ tree, identity: resolveIdentity(io.env), env: io.env, ref: need(positionals[0], '<change>'), onEvent });
      doneProgress();
      const snap = tree.snapshot();
      io.out(statusText(tree, snap, snap.byId.get(row.id)!, false));
      return EXIT_CODES.ok;
    }

    case 'bench': {
      const tree = open();
      const snap = tree.snapshot();
      const runs = runsOption ?? tree.config.policy.runs;
      const baseRow = snap.genesis;
      if (baseRow === null) throw new HellgateError('usage', 'this tree has no genesis change to measure against');
      const baseBatch = await measureBuild(tree, tree.buildFiles(baseRow.body.build), { runs, cache: true, onEvent });
      const builds: { name: string; files: Record<string, string> }[] = [];
      if (values.dir) builds.push({ name: values.dir, files: readBuildDir(resolve(io.cwd, values.dir), tree.config.buildDir) });
      else {
        const c = positionals[0] === undefined ? tree.defaultParent(snap) : tree.find(snap, positionals[0]);
        builds.push({ name: `${c.id.slice(0, 8)} ${c.body.claim.area}/${c.body.claim.motif}`, files: tree.buildFiles(c.body.build) });
      }
      if (values.vs) {
        const c = tree.find(snap, values.vs);
        builds.unshift({ name: `${c.id.slice(0, 8)} ${c.body.claim.area}/${c.body.claim.motif}`, files: tree.buildFiles(c.body.build) });
      }
      const rows: BenchRow[] = [];
      for (const b of builds) {
        const batch = await measureBuild(tree, b.files, { runs, cache: true, onEvent });
        rows.push({ name: b.name, batch, against: scoreAgainstBase(batch, baseBatch) });
      }
      doneProgress();
      io.out(benchText(tree, rows, `base ${baseRow.id.slice(0, 8)}`));
      return EXIT_CODES.ok;
    }

    case 'status':
    case 'check': {
      const tree = open();
      const snap = tree.snapshot();
      if (command === 'status' && positionals[0] === undefined) {
        io.out(values.json ? JSON.stringify(snap.changes.map((c) => ({ id: c.id, ...c.verdict })), null, 2) : treeText(tree, snap));
        return EXIT_CODES.ok;
      }
      const c = tree.find(snap, need(positionals[0], '<change>'));
      io.out(values.json ? JSON.stringify({ id: c.id, ...c.verdict }, null, 2) : statusText(tree, snap, c, values.why === true || command === 'check'));
      if (command === 'status') return EXIT_CODES.ok;
      return c.verdict.status === 'accepted' ? EXIT_CODES.ok : c.verdict.status === 'rejected' || c.verdict.status === 'void' ? EXIT_CODES.rejected : EXIT_CODES.pending;
    }

    case 'tree': {
      const tree = open();
      io.out(treeText(tree, tree.snapshot()));
      return EXIT_CODES.ok;
    }
    case 'graveyard':
      io.out(graveyardText(open().snapshot()));
      return EXIT_CODES.ok;
    case 'show': {
      const tree = open();
      const snap = tree.snapshot();
      io.out(showText(tree, snap, tree.find(snap, need(positionals[0], '<change>'))));
      return EXIT_CODES.ok;
    }
    case 'digest': {
      const tree = open();
      io.out(digestText(tree, tree.snapshot()));
      return EXIT_CODES.ok;
    }
    case 'export': {
      const text = JSON.stringify(buildExport(open()), null, 2);
      if (values.out) writeFileSync(resolve(io.cwd, values.out), `${text}\n`);
      else io.out(text);
      return EXIT_CODES.ok;
    }
    case 'pull':
    case 'push': {
      const tree = open();
      const url = positionals[0] ?? io.env.HELLGATE_HUB;
      if (!url) throw new HellgateError('usage', `${command} needs the hub URL, or HELLGATE_HUB`);
      const result = command === 'pull' ? await pull(url, tree.config.tree, tree.ledger, tree.config) : await push(url, tree.config.tree, tree.ledger);
      io.out(`${command === 'pull' ? 'pulled' : 'pushed'} ${result.added} new, ${result.alreadyPresent} already there${result.rejected.length ? `, ${result.rejected.length} refused` : ''}`);
      for (const r of result.rejected.slice(0, 5)) io.err(`  ${r.id.slice(0, 8)}  ${r.reason}`);
      return result.rejected.length > 0 ? EXIT_CODES.integrity : EXIT_CODES.ok;
    }

    case 'serve': {
      const trees = roots.map((r) => new Tree(r, repo));
      const bots: Record<string, string> = {};
      for (const [name, key] of [['bot-1', 'HELLGATE_BOT_1_SECRET'], ['bot-2', 'HELLGATE_BOT_2_SECRET']] as const) if (io.env[key]) bots[name] = io.env[key]!;
      const hub = new Hub({ trees, token: io.env.HELLGATE_HUB_TOKEN, bots });
      const port = await hub.listen(Number(values.port ?? 8787), values.host ?? '127.0.0.1');
      io.out(`hub on http://${values.host ?? '127.0.0.1'}:${port} serving ${trees.map((t) => t.config.tree).join(', ')}${io.env.HELLGATE_HUB_TOKEN ? '' : ' (jobs are off: set HELLGATE_HUB_TOKEN)'}`);
      await new Promise<void>((done) => {
        process.once('SIGINT', done);
        process.once('SIGTERM', done);
      });
      await hub.close();
      return EXIT_CODES.ok;
    }

    default:
      throw new HellgateError('usage', `unknown command "${command}". Run \`hellgate help\`.`);
  }
}

if (process.argv[1] !== undefined && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  process.exitCode = await run(process.argv.slice(2), {
    out: (t) => console.log(t), err: (t) => console.error(t), env: process.env, cwd: process.cwd(), tty: process.stderr.isTTY === true,
  });
}
