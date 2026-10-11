/**
 * Running a task's hidden cases against a solution (wall 2).
 *
 * The solution is written to a fresh directory, which is the only thing the test process may read.
 * The cases travel inside the program text over stdin and never touch disk. One process runs the
 * cases in order and reports each on file descriptor 3.
 *
 * A case that hangs (a synchronous loop no timer can interrupt) or crashes the process fails, and
 * the remaining cases run again in a fresh process. After `MAX_RESTARTS` of those the rest fail.
 */
import { randomBytes } from 'node:crypto';
import { pathToFileURL } from 'node:url';
import { join } from 'node:path';

import { HellgateError } from '../core/errors.ts';
import { runJailed } from './jail.ts';
import { failedCases } from './outcome.ts';
import { programFor } from './programs.ts';
import { endingOf, peek, readReport, type ReportRecord } from './report.ts';
import { withWorkdir, type JailFile } from './workdir.ts';

export interface CaseRunInput {
  /** The module the cases import, e.g. `solution.mjs`. */
  entry: string;
  /** The agent's answer. An empty answer is allowed, and every case then fails. */
  files: readonly JailFile[];
  /** The task's `cases.mjs`, verbatim. */
  casesSource: string;
  /** The per-case time limit. */
  timeoutMs: number;
}

export interface CaseRun {
  names: string[];
  passed: boolean[];
  /** The first line of each failing case's error, for logs only. */
  errors: (string | null)[];
  status: 'ok' | 'load-error' | 'tampered' | 'gave-up';
  /** How many cases hung or crashed their process. */
  hangs: number;
  detail: string;
  ms: number;
}

const STARTUP_MS = 10_000;
const BETWEEN_CASES_MS = 5_000;
const KILL_GRACE_MS = 1_000;
const MAX_RESTARTS = 3;

const byType = (records: readonly ReportRecord[], t: string): ReportRecord[] => records.filter((r) => r.t === t);

export async function runCaseTests(input: CaseRunInput): Promise<CaseRun> {
  const startedAt = performance.now();
  return withWorkdir(input.files, async (dir) => {
    const entryUrl = pathToFileURL(join(dir, input.entry)).href;
    let names: string[] | null = null;
    let passed: boolean[] = [];
    let errors: (string | null)[] = [];
    let hangs = 0;
    let from = 0;

    const finish = (status: CaseRun['status'], detail: string): CaseRun => {
      const count = names?.length ?? 0;
      if (status === 'tampered') {
        passed = failedCases(count);
        errors = Array.from({ length: count }, () => null);
      }
      return { names: names ?? [], passed, errors, status, hangs, detail, ms: Math.round(performance.now() - startedAt) };
    };

    for (;;) {
      const nonce = randomBytes(16).toString('hex');
      const program = programFor('testbed', { nonce, entryUrl, casesSource: input.casesSource, timeoutMs: input.timeoutMs, from });
      const outcome = await runJailed({
        readDir: dir,
        program,
        deadlineMs: STARTUP_MS,
        onLine(line, control) {
          const seen = peek(line);
          if (seen?.t === 'ready') control.setDeadline(input.timeoutMs + KILL_GRACE_MS); // the solution is loading
          else if (seen?.t === 'start') control.setDeadline(input.timeoutMs + KILL_GRACE_MS);
          else if (seen?.t === 'case') control.setDeadline(BETWEEN_CASES_MS);
        },
      });
      const report = readReport(outcome.lines, nonce);
      const ending = endingOf(report, outcome);

      const fatal = byType(report.records, 'fatal')[0];
      if (fatal !== undefined) throw new HellgateError('integrity', `the test process could not start: ${String(fatal.message)}`);

      // The cases load before the solution does, so the list is trustworthy even when the solution
      // later tampers. A tampered task must still report how many cases it failed.
      const ready = byType(report.records, 'ready');
      const reported = ready.length === 1 && Array.isArray(ready[0]!.names) ? (ready[0]!.names as unknown[]).map(String) : null;
      if (reported === null) {
        throw new HellgateError('environment', `the test process did not start (${outcome.killed?.detail ?? `exit ${outcome.exitCode}`}): ${outcome.stderr.trim().slice(-300)}`);
      }
      if (names === null) {
        names = reported;
        passed = failedCases(names.length);
        errors = Array.from({ length: names.length }, () => null);
      } else if (names.join('\n') !== reported.join('\n')) {
        return finish('tampered', 'the case list changed between runs');
      }
      if (ending === 'tampered') return finish('tampered', describeTampering(report.foreign, outcome.exitCode));

      const loadError = byType(report.records, 'load-error')[0];
      if (loadError !== undefined) return finish('load-error', `the solution did not load: ${String(loadError.message)}`);

      // Case records must arrive in order, each after its own start, and nothing may repeat.
      let expected = from;
      let running = -1;
      for (const record of report.records) {
        if (record.t === 'start') {
          if (record.i !== expected || running !== -1 || expected >= names.length) return finish('tampered', 'case records out of order');
          running = expected;
        } else if (record.t === 'case') {
          if (record.i !== running || typeof record.ok !== 'boolean') return finish('tampered', 'case records out of order');
          passed[running] = record.ok;
          errors[running] = record.ok ? null : typeof record.error === 'string' ? record.error : null;
          expected = running + 1;
          running = -1;
        }
      }

      if (ending === 'complete') {
        if (expected !== names.length) return finish('tampered', 'the run ended before every case reported');
        return finish('ok', hangs === 0 ? 'every case ran' : `${hangs} case(s) hung or crashed their process`);
      }

      // The process was killed or died. The case that was running (or the load, if none had
      // started) is the one that did not finish.
      if (running === -1 && expected === from) {
        return finish('load-error', outcome.killed !== null ? 'the solution did not finish loading in time' : 'the solution crashed while loading');
      }
      if (running !== -1) {
        errors[running] = outcome.killed !== null ? 'did not finish in time' : 'crashed the process';
        expected = running + 1;
      }
      hangs++;
      if (expected >= names.length) return finish('ok', `${hangs} case(s) hung or crashed their process`);
      if (hangs > MAX_RESTARTS) return finish('gave-up', `stopped after ${hangs} hung or crashed cases`);
      from = expected;
    }
  });
}

function describeTampering(foreign: number, exitCode: number | null): string {
  return foreign > 0 ? `${foreign} unrecognised line(s) on the report channel` : `the report and the exit code (${exitCode}) disagree`;
}
