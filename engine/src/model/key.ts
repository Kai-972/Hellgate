/**
 * The request key (PROTOCOL §5.3): what a recording is indexed by. It covers everything that can change
 * what a provider answers, and nothing that cannot. The slot and the call-site tag are NOT in it: the
 * same request sent from another call site, or renamed, finds the same recorded answer. The resolved
 * provider and model ARE in it, so a recording made against one model never answers for another.
 */
import { idOf } from '../core/canonical.ts';
import type { ModelRequest } from './types.ts';

export function requestKey(provider: string, model: string, request: ModelRequest, seed: number): string {
  return idOf({
    type: 'request',
    provider,
    model,
    system: request.system ?? null,
    messages: request.messages.map((m) => ({ role: m.role, text: m.text })),
    maxOutputTokens: request.maxOutputTokens ?? null,
    temperature100: request.temperature === undefined ? null : Math.round(request.temperature * 100),
    stop: request.stop === undefined ? null : [...request.stop],
    seed,
  });
}

/** `"gemini:gemini-3.1-flash-lite"` → `{ provider: "gemini", model: "gemini-3.1-flash-lite" }`. */
export function splitModelRef(ref: string): { provider: 'gemini' | 'groq'; model: string } {
  const at = ref.indexOf(':');
  return { provider: ref.slice(0, at) as 'gemini' | 'groq', model: ref.slice(at + 1) };
}
