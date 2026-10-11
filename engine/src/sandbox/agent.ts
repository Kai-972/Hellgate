/**
 * The agent jail (wall 1): the code domain's agent runs here, with the task brief and a kit.
 *
 * It can read its own folder and nothing else, and it never sees a test case. Its only way out is
 * the IPC channel, and the parent answers every model request there, so the parent owns the
 * budget, the rate limits and the recording. The agent's answer is a set of solution files, which
 * are checked here before anything is written to disk.
 */
import { randomBytes } from 'node:crypto';
import { pathToFileURL } from 'node:url';
import { join } from 'node:path';

import { HellgateError } from '../core/errors.ts';
import { ModelCallRefused, ModelReplySchema, parseModelRequest, type ModelReply, type ModelRequest, type Remaining } from '../model/types.ts';
import type { TaskBrief } from '../suite/tasks.ts';
import { runJailed } from './jail.ts';
import type { TaskStatus } from './outcome.ts';
import { programFor } from './programs.ts';
import { endingOf, peek, readReport } from './report.ts';
import { checkAnswerFiles, withWorkdir, type JailFile } from './workdir.ts';

export interface AgentRunInput {
  /** The build's `agent/*.ts` files. */
  files: readonly JailFile[];
  brief: TaskBrief;
  /** The 32-bit seed of `kit.random` and `Math.random` inside the jail. */
  seed: number;
  /**
   * Answers one model request. It throws `ModelCallRefused` to refuse a single call (the agent
   * sees a rejected promise); anything else it throws is an infrastructure failure and ends the run.
   */
  serve: (request: ModelRequest) => Promise<ModelReply>;
  /** What the agent may still spend. Read when the jail starts and after every reply. */
  remaining: () => Remaining;
  /** How long the agent may compute between model replies. Time spent waiting on the model is free. */
  computeMs?: number;
  /** A ceiling on requests per run, whatever the gateway's own budget says. */
  maxRequests?: number;
}

export interface AgentRun {
  status: TaskStatus;
  /** The solution files, present only when `status` is `ok`. */
  answer: JailFile[] | null;
  clean: boolean;
  modelCalls: number;
  ms: number;
  trace: { event: string; data: unknown }[];
  detail: string;
}

const STARTUP_MS = 15_000;
const DEFAULT_COMPUTE_MS = 30_000;
const DEFAULT_MAX_REQUESTS = 64;

export async function runAgent(input: AgentRunInput): Promise<AgentRun> {
  const computeMs = input.computeMs ?? DEFAULT_COMPUTE_MS;
  const maxRequests = input.maxRequests ?? DEFAULT_MAX_REQUESTS;
  return withWorkdir(input.files, async (dir) => {
    const nonce = randomBytes(16).toString('hex');
    const program = programFor('agentbed', {
      nonce,
      seed: input.seed,
      entryUrl: pathToFileURL(join(dir, 'agent', 'index.ts')).href,
      brief: input.brief,
      remaining: input.remaining(),
    });

    let inFlight = 0;
    let calls = 0;
    let fatal: unknown = null;

    const outcome = await runJailed({
      readDir: dir,
      program,
      ipc: true,
      deadlineMs: STARTUP_MS,
      onLine(line, control) {
        if (peek(line)?.t === 'begin') control.setDeadline(computeMs);
      },
      onMessage(message, control) {
        const m = message as { kind?: unknown; id?: unknown; request?: unknown } | null;
        if (m === null || typeof m !== 'object' || m.kind !== 'model' || typeof m.id !== 'number') return;
        const id = m.id;
        const refuse = (reason: string): void => control.send({ kind: 'reply', id, error: reason });
        const parsed = parseModelRequest(m.request);
        if (!parsed.ok) return refuse(`invalid model request (${parsed.reason})`);
        if (calls >= maxRequests) return refuse(`at most ${maxRequests} model requests per task`);
        calls++;
        inFlight++;
        control.setDeadline(null); // time spent waiting for the model is not the agent's compute time
        input
          .serve(parsed.request)
          .then(
            (reply) => {
              const checked = ModelReplySchema.safeParse(reply);
              if (!checked.success) throw new HellgateError('integrity', 'the model service returned a malformed reply');
              control.send({ kind: 'reply', id, reply: checked.data, remaining: input.remaining() });
            },
            (err: unknown) => {
              if (err instanceof ModelCallRefused) return refuse(err.message);
              throw err;
            },
          )
          .catch((err: unknown) => {
            fatal ??= err;
            control.kill('the model service failed');
          })
          .finally(() => {
            inFlight--;
            if (inFlight === 0 && fatal === null) control.setDeadline(computeMs);
          });
      },
    });
    if (fatal !== null) throw fatal;

    const report = readReport(outcome.lines, nonce);
    const ending = endingOf(report, outcome);
    const done = (status: TaskStatus, detail: string, extra: Partial<AgentRun> = {}): AgentRun => ({
      status, answer: null, clean: status !== 'tampered', modelCalls: calls, ms: outcome.elapsedMs, trace: [], detail, ...extra,
    });

    if (ending === 'tampered') return done('tampered', report.foreign > 0 ? 'unrecognised lines on the report channel' : 'the report and the exit code disagree');
    const began = report.records.some((r) => r.t === 'begin');
    if (ending === 'killed') {
      if (!began) throw new HellgateError('environment', `the agent jail did not start: ${outcome.stderr.trim().slice(-300)}`);
      return done('timeout', `the agent computed for more than ${computeMs} ms without a model reply`);
    }
    const fatalRecord = report.records.find((r) => r.t === 'fatal');
    if (ending === 'crashed') return done('crashed', fatalRecord ? String(fatalRecord.message) : `the process died (exit ${outcome.exitCode}${outcome.signal ? `, ${outcome.signal}` : ''})`);

    const loadError = report.records.find((r) => r.t === 'load-error');
    if (loadError !== undefined) return done('load-error', String(loadError.message));
    const solveError = report.records.find((r) => r.t === 'solve-error');
    if (solveError !== undefined) return done('run-error', String(solveError.message), { trace: traceOf(solveError.trace) });

    const answer = report.records.find((r) => r.t === 'answer');
    if (answer === undefined) return done('tampered', 'the run closed without an answer');
    const trace = traceOf(answer.trace);
    const files = checkAnswerFiles(answer.files);
    if (!files.ok) return done('bad-output', files.reason, { trace });
    return { status: 'ok', answer: files.files, clean: true, modelCalls: calls, ms: outcome.elapsedMs, trace, detail: 'finished' };
  });
}

function traceOf(value: unknown): AgentRun['trace'] {
  if (!Array.isArray(value)) return [];
  return value.slice(0, 64).map((e) => ({ event: String((e as { event?: unknown })?.event ?? ''), data: (e as { data?: unknown })?.data ?? null }));
}
