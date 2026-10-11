/**
 * The two provider clients behind one small interface (ARCHITECTURE §6.6). A client turns a request
 * into one HTTP call and the reply back into a `ModelReply`. It knows nothing about budgets, retries,
 * recording or slots: that is the gateway's business.
 */
import { HellgateError } from '../core/errors.ts';
import type { ModelReply, ModelRequest } from './types.ts';

export interface Call {
  model: string;
  request: ModelRequest;
  /** The run's seed, sent to the provider. It never comes from the agent. */
  seed: number;
}

export interface Provider {
  readonly name: 'gemini' | 'groq';
  generate(call: Call, signal: AbortSignal): Promise<ModelReply>;
}

/** A failed provider call. `retryable` is true for rate limits, server errors and network trouble. */
export class ProviderError extends Error {
  readonly status: number | null;
  readonly retryable: boolean;
  readonly retryAfterMs: number | null;

  constructor(message: string, status: number | null, retryable: boolean, retryAfterMs: number | null = null) {
    super(message);
    this.name = 'ProviderError';
    this.status = status;
    this.retryable = retryable;
    this.retryAfterMs = retryAfterMs;
  }
}

type Fetch = typeof fetch;

async function post(fetcher: Fetch, url: string, headers: Record<string, string>, body: unknown, signal: AbortSignal, who: string): Promise<any> {
  let res: Response;
  try {
    res = await fetcher(url, { method: 'POST', headers: { 'content-type': 'application/json', ...headers }, body: JSON.stringify(body), signal });
  } catch (err) {
    throw new ProviderError(`${who}: ${err instanceof Error ? err.message : String(err)}`, null, true);
  }
  const text = await res.text();
  if (!res.ok) {
    const retryAfter = Number(res.headers.get('retry-after'));
    const retryable = res.status === 429 || res.status >= 500;
    throw new ProviderError(`${who} answered ${res.status}: ${text.slice(0, 300)}`, res.status, retryable, Number.isFinite(retryAfter) && retryAfter > 0 ? retryAfter * 1000 : null);
  }
  try {
    return JSON.parse(text);
  } catch {
    throw new ProviderError(`${who} returned something that is not JSON`, res.status, true);
  }
}

/* ------------------------------------------------------------------ Gemini */

const GEMINI_FINISH: Record<string, ModelReply['finish']> = { STOP: 'stop', MAX_TOKENS: 'length' };

export class GeminiProvider implements Provider {
  readonly name = 'gemini' as const;
  private readonly key: string;
  private readonly base: string;
  private readonly fetcher: Fetch;

  constructor(apiKey: string, options: { baseUrl?: string; fetch?: Fetch } = {}) {
    this.key = apiKey;
    this.base = (options.baseUrl ?? 'https://generativelanguage.googleapis.com').replace(/\/+$/, '');
    this.fetcher = options.fetch ?? fetch;
  }

  /** The request body: `system` → `systemInstruction`, role `assistant` → `model`, no thinking. */
  static body(call: Call): Record<string, unknown> {
    const r = call.request;
    return {
      ...(r.system !== undefined ? { systemInstruction: { parts: [{ text: r.system }] } } : {}),
      contents: r.messages.map((m) => ({ role: m.role === 'assistant' ? 'model' : 'user', parts: [{ text: m.text }] })),
      generationConfig: {
        ...(r.maxOutputTokens !== undefined ? { maxOutputTokens: r.maxOutputTokens } : {}),
        ...(r.temperature !== undefined ? { temperature: r.temperature } : {}),
        ...(r.stop !== undefined ? { stopSequences: r.stop } : {}),
        seed: call.seed,
        thinkingConfig: { thinkingBudget: 0 },
      },
    };
  }

  async generate(call: Call, signal: AbortSignal): Promise<ModelReply> {
    const url = `${this.base}/v1beta/models/${encodeURIComponent(call.model)}:generateContent`;
    const data = await post(this.fetcher, url, { 'x-goog-api-key': this.key }, GeminiProvider.body(call), signal, 'Gemini');
    const candidate = data?.candidates?.[0];
    if (candidate === undefined) {
      const why = data?.promptFeedback?.blockReason ?? 'no candidates';
      throw new ProviderError(`Gemini returned no answer (${why})`, 200, false);
    }
    const text = ((candidate.content?.parts ?? []) as { text?: string }[]).map((p) => p.text ?? '').join('');
    return {
      text,
      finish: GEMINI_FINISH[candidate.finishReason as string] ?? 'other',
      inputTokens: Number(data.usageMetadata?.promptTokenCount ?? 0),
      outputTokens: Number(data.usageMetadata?.candidatesTokenCount ?? 0),
    };
  }
}

/* ------------------------------------------------------------------ Groq */

export class GroqProvider implements Provider {
  readonly name = 'groq' as const;
  private readonly key: string;
  private readonly base: string;
  private readonly fetcher: Fetch;

  constructor(apiKey: string, options: { baseUrl?: string; fetch?: Fetch } = {}) {
    this.key = apiKey;
    this.base = (options.baseUrl ?? 'https://api.groq.com').replace(/\/+$/, '');
    this.fetcher = options.fetch ?? fetch;
  }

  /** The OpenAI-style body: `system` becomes the first message, `maxOutputTokens` → `max_completion_tokens`. */
  static body(call: Call): Record<string, unknown> {
    const r = call.request;
    return {
      model: call.model,
      messages: [...(r.system !== undefined ? [{ role: 'system', content: r.system }] : []), ...r.messages.map((m) => ({ role: m.role, content: m.text }))],
      ...(r.maxOutputTokens !== undefined ? { max_completion_tokens: r.maxOutputTokens } : {}),
      ...(r.temperature !== undefined ? { temperature: r.temperature } : {}),
      ...(r.stop !== undefined ? { stop: r.stop } : {}),
      seed: call.seed,
      // Reasoning models spend the token budget thinking; keep it small and keep the thoughts out of the text.
      ...(/gpt-oss/.test(call.model) ? { reasoning_effort: 'low', include_reasoning: false } : {}),
    };
  }

  async generate(call: Call, signal: AbortSignal): Promise<ModelReply> {
    const data = await post(this.fetcher, `${this.base}/openai/v1/chat/completions`, { authorization: `Bearer ${this.key}` }, GroqProvider.body(call), signal, 'Groq');
    const choice = data?.choices?.[0];
    if (choice === undefined) throw new ProviderError('Groq returned no choices', 200, false);
    return {
      text: String(choice.message?.content ?? ''),
      finish: choice.finish_reason === 'stop' ? 'stop' : choice.finish_reason === 'length' ? 'length' : 'other',
      inputTokens: Number(data.usage?.prompt_tokens ?? 0),
      outputTokens: Number(data.usage?.completion_tokens ?? 0),
    };
  }
}

export function providerFromEnv(name: 'gemini' | 'groq', env: Readonly<Record<string, string | undefined>>): Provider {
  const key = name === 'gemini' ? env.GEMINI_API_KEY : env.GROQ_API_KEY;
  if (!key) throw new HellgateError('environment', `${name === 'gemini' ? 'GEMINI_API_KEY' : 'GROQ_API_KEY'} is not set`);
  return name === 'gemini' ? new GeminiProvider(key) : new GroqProvider(key);
}
