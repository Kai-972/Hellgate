/**
 * The model gateway (ARCHITECTURE §6.6): the one place a model is ever called from. The agent in its
 * jail asks for a slot; the gateway turns the slot into a provider and model through the tree's config,
 * enforces the per-task budget, applies the provider's rate limit, retries transient failures, and in
 * `record` mode captures every reply so a verifier can replay the run without a key or a network.
 *
 *   record  call the provider, keep every request and reply
 *   replay  answer from a recording, by request key; a request that is not there is a miss
 *   live    call the provider, keep nothing
 *
 * An infrastructure failure (a provider that stays down, a bad key) is thrown as an error, never turned
 * into a score: the run is repeated or nothing is signed.
 */
import { HellgateError } from '../core/errors.ts';
import type { RecordingBody } from '../ledger/records.ts';
import { seedInt } from '../suite/seeds.ts';
import { requestKey, splitModelRef } from './key.ts';
import { RateLimiter, TokenLimiter } from './limiter.ts';
import { ProviderError, type Provider } from './providers.ts';
import { ModelCallRefused, type ModelReply, type ModelRequest, type Remaining } from './types.ts';

export type Mode = 'record' | 'replay' | 'live';
export type SlotName = 'primary' | 'secondary';

export interface Entry {
  key: string;
  slot: SlotName;
  response: ModelReply;
}

export interface GatewayOptions {
  mode: Mode;
  models: { primary: string; secondary: string | null };
  providers: Partial<Record<'gemini' | 'groq', Provider>>;
  /** The entries to answer from, in `replay` mode. */
  recording?: readonly Entry[];
  /** Per task: calls across slots, tokens (in plus out) and milliseconds. */
  budget?: Remaining;
  /** Requests per minute for each provider. Defaults are conservative free-tier values. */
  rpm?: { gemini?: number; groq?: number };
  /** Tokens per minute per provider. Groq's free tier allows few, so it has a default; Gemini has none unless set. */
  tpm?: { gemini?: number; groq?: number };
  retries?: { attempts?: number; baseMs?: number; sleep?: (ms: number) => Promise<void> };
  callTimeoutMs?: number;
}

export const DEFAULT_BUDGET: Remaining = { calls: 6, tokens: 60_000, ms: 90_000 };

export interface Usage {
  calls: number;
  inputTokens: number;
  outputTokens: number;
}

export class Gateway {
  readonly mode: Mode;
  readonly models: GatewayOptions['models'];
  /** What was recorded (record mode), by key. */
  readonly recorded = new Map<string, Entry>();
  /** What each slot has cost so far, across every task. */
  readonly usage: Record<SlotName, Usage> = { primary: { calls: 0, inputTokens: 0, outputTokens: 0 }, secondary: { calls: 0, inputTokens: 0, outputTokens: 0 } };
  private readonly options: GatewayOptions;
  private readonly replay: Map<string, Entry>;
  private readonly limiters: Record<'gemini' | 'groq', RateLimiter>;
  private readonly tokenLimiters: Partial<Record<'gemini' | 'groq', TokenLimiter>> = {};
  private readonly budget: Remaining;

  constructor(options: GatewayOptions) {
    this.options = options;
    this.mode = options.mode;
    this.models = options.models;
    this.budget = options.budget ?? DEFAULT_BUDGET;
    this.replay = new Map((options.recording ?? []).map((e) => [e.key, e]));
    this.limiters = { gemini: new RateLimiter(options.rpm?.gemini ?? 15), groq: new RateLimiter(options.rpm?.groq ?? 30) };
    const tpm = { groq: 6500, ...options.tpm };
    for (const provider of ['gemini', 'groq'] as const) {
      const limit = tpm[provider as keyof typeof tpm];
      if (limit !== undefined && limit > 0) this.tokenLimiters[provider] = new TokenLimiter(limit);
    }
  }

  static fromRecording(body: RecordingBody, options: Omit<GatewayOptions, 'mode' | 'models' | 'recording'>): Gateway {
    return new Gateway({ ...options, mode: 'replay', models: body.models, recording: body.entries });
  }

  /** The recording of everything this gateway has answered in `record` mode. */
  recordingBody(build: string, suite: string, runs: number): RecordingBody {
    return {
      type: 'recording', v: 1, build, suite, runs,
      models: { primary: this.models.primary, secondary: this.models.secondary },
      entries: [...this.recorded.values()].sort((a, b) => (a.key < b.key ? -1 : 1)),
    };
  }

  /** A budget and a seed for one task in one run. */
  session(runSeed: string): TaskSession {
    return new TaskSession(this, seedInt(runSeed), this.budget);
  }

  /** @internal Answer one request; called by a task session. */
  async answer(slot: SlotName, request: ModelRequest, seed: number): Promise<{ reply: ModelReply; replayed: boolean }> {
    const ref = this.models[slot];
    if (ref === null) throw new ModelCallRefused(`no ${slot} model is configured for this tree`);
    const { provider, model } = splitModelRef(ref);
    const key = requestKey(provider, model, request, seed);

    if (this.mode === 'replay') {
      const hit = this.replay.get(key);
      if (hit === undefined) throw new ReplayMiss(key);
      this.count(slot, hit.response);
      return { reply: hit.response, replayed: true };
    }
    const client = this.options.providers[provider];
    if (client === undefined) throw new HellgateError('environment', `no ${provider} client is configured; set its API key`);
    const reply = await this.callWithRetries(client, provider, model, request, seed);
    if (this.mode === 'record' && !this.recorded.has(key)) this.recorded.set(key, { key, slot, response: reply });
    this.count(slot, reply);
    return { reply, replayed: false };
  }

  private count(slot: SlotName, reply: ModelReply): void {
    const u = this.usage[slot];
    u.calls++;
    u.inputTokens += reply.inputTokens;
    u.outputTokens += reply.outputTokens;
  }

  private async callWithRetries(client: Provider, provider: 'gemini' | 'groq', model: string, request: ModelRequest, seed: number): Promise<ModelReply> {
    const attempts = this.options.retries?.attempts ?? 5;
    const baseMs = this.options.retries?.baseMs ?? 1000;
    const sleep = this.options.retries?.sleep ?? ((ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms)));
    let last: ProviderError | null = null;
    for (let attempt = 0; attempt < attempts; attempt++) {
      await this.limiters[provider].acquire();
      const estimate = Math.ceil(((request.system ?? '').length + request.messages.reduce((n, m) => n + m.text.length, 0)) / 3.5) + (request.maxOutputTokens ?? 1000);
      const settle = await this.tokenLimiters[provider]?.reserve(estimate);
      const abort = new AbortController();
      const timer = setTimeout(() => abort.abort(), this.options.callTimeoutMs ?? 60_000);
      try {
        const reply = await client.generate({ model, request, seed }, abort.signal);
        settle?.(reply.inputTokens + reply.outputTokens);
        return reply;
      } catch (err) {
        const failure = err instanceof ProviderError ? err : new ProviderError(err instanceof Error ? err.message : String(err), null, true);
        if (!failure.retryable) throw new HellgateError('environment', failure.message, { cause: err });
        last = failure;
        await sleep(failure.retryAfterMs ?? baseMs * 2 ** attempt);
      } finally {
        clearTimeout(timer);
      }
    }
    throw new HellgateError('environment', `${provider} kept failing after ${attempts} attempts: ${last?.message ?? 'unknown error'}`, { cause: last });
  }
}

/** Thrown by `answer` in replay mode when a request was not recorded. The session turns it into a refusal. */
export class ReplayMiss extends Error {
  readonly key: string;
  constructor(key: string) {
    super('this request is not in the recording');
    this.name = 'ReplayMiss';
    this.key = key;
  }
}

export class TaskSession {
  private calls = 0;
  private tokens = 0;
  private misses = 0;
  private readonly started = Date.now();
  private readonly gateway: Gateway;
  private readonly seed: number;
  private readonly budget: Remaining;

  constructor(gateway: Gateway, seed: number, budget: Remaining) {
    this.gateway = gateway;
    this.seed = seed;
    this.budget = budget;
  }

  /** How many requests were not in the recording. Any miss makes the task's batch unclean. */
  get missed(): number {
    return this.misses;
  }

  remaining(): Remaining {
    return {
      calls: Math.max(0, this.budget.calls - this.calls),
      tokens: Math.max(0, this.budget.tokens - this.tokens),
      // Replays take no time, so only a real call has a clock to run out.
      ms: this.gateway.mode === 'replay' ? this.budget.ms : Math.max(0, this.budget.ms - (Date.now() - this.started)),
    };
  }

  /** Answers one request from the agent: the function the sandbox's `serve` is. */
  serve = async (request: ModelRequest): Promise<ModelReply> => {
    const left = this.remaining();
    if (left.calls <= 0) throw new ModelCallRefused(`the budget of ${this.budget.calls} model calls for this task is spent`);
    if (left.tokens <= 0) throw new ModelCallRefused(`the budget of ${this.budget.tokens} tokens for this task is spent`);
    if (left.ms <= 0) throw new ModelCallRefused(`the time budget of ${this.budget.ms} ms for this task is spent`);
    this.calls++; // a request counts when it is made, so a failure cannot be retried for free
    try {
      const { reply } = await this.gateway.answer(request.slot ?? 'primary', request, this.seed);
      this.tokens += reply.inputTokens + reply.outputTokens;
      return reply;
    } catch (err) {
      if (err instanceof ReplayMiss) {
        this.misses++;
        throw new ModelCallRefused(err.message);
      }
      throw err;
    }
  };
}
