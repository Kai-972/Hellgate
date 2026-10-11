/**
 * Building a model gateway for a tree from its config and the environment.
 */
import { HellgateError } from '../core/errors.ts';
import type { Config } from '../ledger/config.ts';
import type { RecordingBody } from '../ledger/records.ts';
import { Gateway, type Mode } from '../model/gateway.ts';
import { splitModelRef } from '../model/key.ts';
import { providerFromEnv, type Provider } from '../model/providers.ts';

export const DEFAULT_MODELS = {
  primary: 'gemini:gemini-3.1-flash-lite',
  secondary: 'groq:openai/gpt-oss-120b',
  proposer: 'gemini:gemini-3.5-flash',
} as const;

type Env = Readonly<Record<string, string | undefined>>;

const rpm = (env: Env, name: string): number | undefined => {
  const n = Number(env[name]);
  return Number.isFinite(n) && n > 0 ? n : undefined;
};

/** A gateway for `mode`. Replay needs no keys at all; record and live need the keys of the providers in use. */
export function gatewayFor(config: Config, mode: Mode, env: Env, recording?: RecordingBody): Gateway {
  if (config.models === null) throw new HellgateError('usage', 'this tree has no models configured');
  if (mode === 'replay') {
    if (recording === undefined) throw new HellgateError('usage', 'replay needs a recording');
    return new Gateway({ mode, models: recording.models, providers: {}, recording: recording.entries });
  }
  const providers: Partial<Record<'gemini' | 'groq', Provider>> = {};
  for (const ref of [config.models.primary, config.models.secondary]) {
    if (ref === null) continue;
    const { provider } = splitModelRef(ref);
    providers[provider] ??= providerFromEnv(provider, env);
  }
  return new Gateway({
    mode,
    models: { primary: config.models.primary, secondary: config.models.secondary },
    providers,
    rpm: { ...(rpm(env, 'HELLGATE_RPM_GEMINI') ? { gemini: rpm(env, 'HELLGATE_RPM_GEMINI')! } : {}), ...(rpm(env, 'HELLGATE_RPM_GROQ') ? { groq: rpm(env, 'HELLGATE_RPM_GROQ')! } : {}) },
    tpm: { ...(rpm(env, 'HELLGATE_TPM_GEMINI') ? { gemini: rpm(env, 'HELLGATE_TPM_GEMINI')! } : {}), ...(rpm(env, 'HELLGATE_TPM_GROQ') ? { groq: rpm(env, 'HELLGATE_TPM_GROQ')! } : {}) },
  });
}
