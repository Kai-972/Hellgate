/**
 * The hub: an HTTP server over one or more trees (PROTOCOL §10). It stores nothing the CLI could not
 * have written itself: every posted record goes through `acceptRecord`, and the export it serves is
 * derived from the ledger by the same code the CLI uses. The web app is a client of this and nothing else.
 */
import { createHash, timingSafeEqual } from 'node:crypto';
import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http';

import { verifyChange } from '../app/actions.ts';
import { releaseOf } from '../app/release.ts';
import { Tree } from '../app/tree.ts';
import { canonicalJson } from '../core/canonical.ts';
import { HellgateError, messageOf } from '../core/errors.ts';
import { buildExport } from '../export/build.ts';
import { identityFromSecret, type Identity } from '../identity/keys.ts';
import { envelopeOf } from '../ledger/records.ts';
import { MAX_RECORD_BYTES, acceptRecord } from './intake.ts';
import { challengeJob, cleanInstruction } from './challenge.ts';
import { JobRunner, type Job } from './jobs.ts';

export interface HubOptions {
  trees: Tree[];
  /** `HELLGATE_HUB_TOKEN`. Without one, jobs are disabled entirely. */
  token?: string | undefined;
  /** The demo verifier keys: `bot-1` and `bot-2`. */
  bots?: Record<string, string>;
  /** The house author key that records Beat the gate changes (`HELLGATE_CHALLENGER_SECRET`). Without it, challenges are off. */
  challenger?: string | undefined;
  /** When set, the demo bots verify every pending change on their own (`HELLGATE_AUTO_VERIFY=1`). The value is the polling interval in ms. */
  autoVerifyMs?: number | undefined;
}

const HEX64 = /^[0-9a-f]{64}$/;

export class Hub {
  readonly server: Server;
  private readonly trees = new Map<string, Tree>();
  private readonly runner = new JobRunner();
  private readonly bots = new Map<string, Identity>();
  private readonly challenger: Identity | null;
  private autoTimer: NodeJS.Timeout | null = null;
  private readonly autoFailed = new Set<string>();
  private readonly exports = new Map<string, { version: string; text: string }>();
  private readonly options: HubOptions;

  constructor(options: HubOptions) {
    this.options = options;
    if (options.trees.length === 0) throw new HellgateError('usage', 'a hub needs at least one tree');
    for (const t of options.trees) this.trees.set(t.config.tree, t);
    for (const [name, secret] of Object.entries(options.bots ?? {})) this.bots.set(name, identityFromSecret(secret, name));
    this.challenger = options.challenger ? identityFromSecret(options.challenger, 'challenger') : null;
    this.server = createServer((req, res) => {
      this.handle(req, res).catch((err: unknown) => this.fail(res, err));
    });
  }

  listen(port: number, host = '127.0.0.1'): Promise<number> {
    return new Promise((resolve, reject) => {
      this.server.once('error', reject);
      this.server.listen(port, host, () => {
        if (this.options.autoVerifyMs) this.autoTimer = setInterval(() => this.autoTick(), this.options.autoVerifyMs);
        resolve((this.server.address() as { port: number }).port);
      });
    });
  }

  close(): Promise<void> {
    if (this.autoTimer) clearInterval(this.autoTimer);
    this.server.closeAllConnections();
    return new Promise((resolve) => this.server.close(() => resolve()));
  }

  /* -------------------------------------------------------------- plumbing */

  private send(res: ServerResponse, status: number, body: unknown, type = 'application/json'): void {
    const text = typeof body === 'string' ? body : JSON.stringify(body);
    res.writeHead(status, { 'content-type': type, 'access-control-allow-origin': '*', 'cache-control': 'no-store' });
    res.end(text);
  }

  private fail(res: ServerResponse, err: unknown): void {
    if (res.headersSent) return void res.end();
    const status = err instanceof HellgateError ? ({ usage: 400, integrity: 400, refused: 403, 'not-found': 404, environment: 503 } as Record<string, number>)[err.kind] ?? 500 : 500;
    this.send(res, status, { error: messageOf(err) });
  }

  private async body(req: IncomingMessage): Promise<unknown> {
    const chunks: Buffer[] = [];
    let size = 0;
    for await (const chunk of req) {
      size += (chunk as Buffer).length;
      if (size > MAX_RECORD_BYTES) throw new HellgateError('usage', `the request is larger than ${MAX_RECORD_BYTES} bytes`);
      chunks.push(chunk as Buffer);
    }
    try {
      return JSON.parse(Buffer.concat(chunks).toString('utf8'));
    } catch {
      throw new HellgateError('usage', 'the request body is not valid JSON');
    }
  }

  private version(tree: Tree): string {
    return createHash('sha256').update(tree.ledger.ids().join('\n')).digest('hex');
  }

  private exportText(tree: Tree): string {
    const version = this.version(tree);
    const cached = this.exports.get(tree.config.tree);
    if (cached?.version === version) return cached.text;
    const text = JSON.stringify(buildExport(tree));
    this.exports.set(tree.config.tree, { version, text });
    return text;
  }

  private authorised(req: IncomingMessage): boolean {
    const token = this.options.token;
    if (!token) return false;
    const given = Buffer.from((req.headers.authorization ?? '').replace(/^Bearer\s+/i, ''));
    const want = Buffer.from(token);
    return given.length === want.length && timingSafeEqual(given, want);
  }

  /* -------------------------------------------------------------- routing */

  private async handle(req: IncomingMessage, res: ServerResponse): Promise<void> {
    const url = new URL(req.url ?? '/', 'http://hub');
    const parts = url.pathname.split('/').filter(Boolean);
    const method = req.method ?? 'GET';
    if (method === 'OPTIONS') {
      res.writeHead(204, { 'access-control-allow-origin': '*', 'access-control-allow-methods': 'GET, POST, OPTIONS', 'access-control-allow-headers': 'content-type, authorization' });
      return void res.end();
    }
    if (parts[0] !== 'v1') throw new HellgateError('not-found', 'unknown route');
    let rest = parts.slice(1);

    if (rest[0] === 'trees' && rest.length === 1 && method === 'GET') {
      return this.send(res, 200, [...this.trees.values()].map((t) => ({ name: t.config.tree, domain: t.domain, totals: (JSON.parse(this.exportText(t)) as { totals: unknown }).totals })));
    }
    let tree: Tree;
    if (rest[0] === 'trees') {
      const found = this.trees.get(decodeURIComponent(rest[1] ?? ''));
      if (found === undefined) throw new HellgateError('not-found', `no tree "${rest[1]}"`);
      tree = found;
      rest = rest.slice(2);
    } else tree = [...this.trees.values()][0]!;

    const [route, arg, sub] = rest;
    if (route === 'version' && method === 'GET') return this.send(res, 200, { version: this.version(tree) });
    if (route === 'export' && method === 'GET') return this.send(res, 200, this.exportText(tree));
    if (route === 'production' && method === 'GET') {
      const asked = url.searchParams.get('change');
      try {
        return this.send(res, 200, releaseOf(tree, asked ?? undefined));
      } catch (err) {
        // 404: nothing has passed the gate yet. 409: that change exists but the gate says it cannot be released.
        if (err instanceof HellgateError && err.kind === 'refused') return this.send(res, asked === null ? 404 : 409, { error: err.message });
        throw err;
      }
    }
    if (route === 'records') return this.records(req, res, tree, method, arg, url);
    if (route === 'jobs') return this.jobs(req, res, tree, method, arg, sub);
    throw new HellgateError('not-found', 'unknown route');
  }

  private async records(req: IncomingMessage, res: ServerResponse, tree: Tree, method: string, id: string | undefined, url: URL): Promise<void> {
    if (method === 'GET' && id === undefined) {
      const after = url.searchParams.get('after');
      const limit = Math.min(1000, Math.max(1, Number(url.searchParams.get('limit') ?? 1000) || 1000));
      if (after !== null && !HEX64.test(after)) throw new HellgateError('usage', '"after" must be a record id');
      const all = tree.ledger.ids().filter((i) => after === null || i > after);
      const ids = all.slice(0, limit);
      return this.send(res, 200, { ids, next: all.length > limit ? ids[ids.length - 1]! : null });
    }
    if (method === 'GET' && id !== undefined) {
      if (!HEX64.test(id) || !tree.ledger.has(id)) throw new HellgateError('not-found', `no record ${id}`);
      return this.send(res, 200, canonicalJson(envelopeOf(tree.ledger.get(id))));
    }
    if (method === 'POST' && id === undefined) {
      try {
        const done = acceptRecord(tree.ledger, tree.config, await this.body(req));
        return this.send(res, done.created ? 201 : 200, { id: done.id, type: done.type, created: done.created });
      } catch (err) {
        if (err instanceof HellgateError && err.kind === 'integrity') return this.send(res, 400, { error: err.message });
        throw err;
      }
    }
    throw new HellgateError('not-found', 'unknown route');
  }

  /* -------------------------------------------------------------- jobs */

  private async jobs(req: IncomingMessage, res: ServerResponse, tree: Tree, method: string, arg: string | undefined, sub: string | undefined): Promise<void> {
    if (method === 'GET' && arg === 'current') {
      const job = this.runner.current;
      if (job === null || job.finished) {
        res.writeHead(204, { 'access-control-allow-origin': '*' });
        return void res.end();
      }
      return this.send(res, 200, this.describe(job));
    }
    if (method === 'GET' && arg !== undefined) {
      const job = this.runner.jobs.get(arg);
      if (job === undefined) throw new HellgateError('not-found', `no job ${arg}`);
      if (sub === undefined) return this.send(res, 200, this.describe(job));
      if (sub === 'events') return this.stream(req, res, job);
    }
    if (method === 'POST' && arg === undefined) {
      if (!this.authorised(req)) return this.send(res, 401, { error: 'jobs need the hub token' });
      const request = (await this.body(req)) as { kind?: unknown; change?: unknown; as?: unknown; instruction?: unknown; parent?: unknown };
      if (request.kind === 'challenge') return this.challenge(res, tree, request);
      if (request.kind !== 'verify') throw new HellgateError('usage', 'kind must be "verify" or "challenge"');
      const bot = this.bots.get(String(request.as ?? 'bot-1'));
      if (bot === undefined) throw new HellgateError('usage', `no verifier key "${String(request.as)}" is configured on this hub`);
      const row = tree.find(tree.snapshot(), String(request.change ?? ''));
      if (row.body.signer === bot.address) throw new HellgateError('refused', 'that verifier key authored this change');
      const started = this.runner.start('verify', tree.config.tree, (job) => this.verifyJob(job, tree, bot, row.id, String(request.as ?? 'bot-1')));
      if ('busy' in started) return this.send(res, 409, { error: 'a job is already running', job: started.busy.id });
      return this.send(res, 202, { job: started.job.id });
    }
    throw new HellgateError('not-found', 'unknown route');
  }

  private challenge(res: ServerResponse, tree: Tree, request: { instruction?: unknown; parent?: unknown }): void {
    if (tree.domain !== 'code') return this.send(res, 501, { error: 'Beat the gate runs on the coding tree' });
    const bots = [...this.bots.entries()].map(([name, identity]) => ({ name, identity }));
    if (this.challenger === null || bots.length < tree.config.policy.minVerifiers) {
      return this.send(res, 501, { error: 'this hub has no challenge author key or too few verifier keys (HELLGATE_CHALLENGER_SECRET, HELLGATE_BOT_1_SECRET, HELLGATE_BOT_2_SECRET)' });
    }
    const instruction = cleanInstruction(request.instruction);
    const parent = typeof request.parent === 'string' ? request.parent : undefined;
    const author = this.challenger;
    const started = this.runner.start('challenge', tree.config.tree, (job) => challengeJob(job, { tree, author, verifiers: bots.slice(0, tree.config.policy.minVerifiers), instruction, parent }));
    if ('busy' in started) return this.send(res, 409, { error: 'a job is already running', job: started.busy.id });
    return this.send(res, 202, { job: started.job.id });
  }

  /**
   * The automatic verifiers. A pending change that a bot has not measured yet, and did not author, is verified by
   * that bot: the same `verifyChange` a person runs, so a bot's attestation is as good as anybody's and no better.
   * One job at a time; a change that fails is not retried in a loop.
   */
  private autoTick(): void {
    if (this.runner.current !== null && !this.runner.current.finished) return;
    for (const tree of this.trees.values()) {
      for (const row of tree.snapshot().changes) {
        if (row.verdict.status !== 'pending') continue;
        for (const [name, bot] of this.bots) {
          const key = `${row.id}:${name}`;
          if (row.body.signer === bot.address || row.attestations.some((a) => a.body.signer === bot.address) || this.autoFailed.has(key)) continue;
          const started = this.runner.start('verify', tree.config.tree, async (job) => {
            job.emit('log', { line: `automatic: ${name} picked up the pending change ${row.id.slice(0, 8)}` });
            try {
              return await this.verifyJob(job, tree, bot, row.id, name);
            } catch (err) {
              this.autoFailed.add(key);
              throw err;
            }
          });
          if ('job' in started) return;
        }
      }
    }
  }

  private describe(job: Job) {
    return { job: job.id, kind: job.kind, state: job.state, result: job.result, error: job.error };
  }

  private stream(req: IncomingMessage, res: ServerResponse, job: Job): void {
    res.writeHead(200, { 'content-type': 'text/event-stream', 'cache-control': 'no-store', connection: 'keep-alive', 'access-control-allow-origin': '*', 'x-accel-buffering': 'no' });
    const unsubscribe = job.follow((e) => {
      if (e === null) return void res.end();
      res.write(`event: ${e.event}\ndata: ${JSON.stringify(e.data)}\n\n`);
    });
    req.on('close', unsubscribe);
  }

  private async verifyJob(job: Job, tree: Tree, bot: Identity, changeId: string, name: string): Promise<unknown> {
    job.emit('log', { line: `verifying ${changeId.slice(0, 8)} as ${name}` });
    job.emit('stage', { stage: 'verify', as: name });
    const runs = tree.config.policy.runs;
    const total = 2 * runs * tree.suite().tasks.length;
    let done = 0;
    const { attestation, body } = await verifyChange({
      tree, identity: bot, ref: changeId,
      onEvent: (e) => {
        done++;
        job.emit('progress', { side: done <= total / 2 ? 'parent' : 'candidate', run: e.run, runs, task: e.task, done, of: total, passedCases: e.passed, cases: e.total });
      },
    });
    job.emit('stage', { stage: 'sign', as: name });
    job.emit('attestation', { id: attestation, signer: body.signer, call: body.call, effectBp: body.effectBp, ciLowBp: body.ciLowBp, ciHighBp: body.ciHighBp });
    const row = tree.snapshot().byId.get(changeId)!;
    job.emit('change', { id: row.id, status: row.verdict.status, code: row.verdict.code });
    return { change: row.id, status: row.verdict.status, code: row.verdict.code, reason: row.verdict.reason };
  }
}
