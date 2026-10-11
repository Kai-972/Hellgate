/**
 * The request and reply an agent exchanges with the model (PROTOCOL §12.1), and the checks that
 * make an untrusted request safe to act on.
 *
 * A jailed agent builds a request and sends it over IPC, so everything about it is untrusted until
 * `parseModelRequest` has accepted it. The gateway (Stage 5) takes over from here.
 */
import { z } from 'zod';

export type Slot = 'primary' | 'secondary';

const Message = z.strictObject({
  role: z.enum(['user', 'assistant']),
  text: z.string().max(200_000),
});

export const ModelRequestSchema = z.strictObject({
  tag: z.string().min(1).max(64),
  slot: z.enum(['primary', 'secondary']).optional(),
  system: z.string().max(200_000).optional(),
  messages: z.array(Message).min(1).max(40),
  maxOutputTokens: z.int().min(1).max(32_768).optional(),
  temperature: z.number().min(0).max(2).optional(),
  stop: z.array(z.string().min(1).max(64)).max(4).optional(),
});
export type ModelRequest = z.infer<typeof ModelRequestSchema>;

export const ModelReplySchema = z.strictObject({
  text: z.string(),
  finish: z.enum(['stop', 'length', 'other']),
  inputTokens: z.int().min(0),
  outputTokens: z.int().min(0),
});
export type ModelReply = z.infer<typeof ModelReplySchema>;

/** What an agent can still spend. The agent sees it through `kit.budget.remaining()`. */
export interface Remaining {
  calls: number;
  tokens: number;
  ms: number;
}

export type ParsedRequest = { ok: true; request: ModelRequest } | { ok: false; reason: string };

export function parseModelRequest(value: unknown): ParsedRequest {
  const parsed = ModelRequestSchema.safeParse(value);
  if (parsed.success) return { ok: true, request: parsed.data };
  const issue = parsed.error.issues[0];
  return { ok: false, reason: `${issue?.path.join('.') || 'request'}: ${issue?.message ?? 'invalid'}` };
}

/**
 * Thrown by whatever answers model requests when it refuses ONE call (the budget is spent, say).
 * The agent sees a rejected promise and carries on. Any other error is treated as an
 * infrastructure failure: the whole run stops and nothing is scored (PROTOCOL §9).
 */
export class ModelCallRefused extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ModelCallRefused';
  }
}
