/**
 * Reading the report a jailed program wrote on file descriptor 3, and deciding whether to believe it.
 *
 * Every honest line carries the nonce the parent chose for this run. The nonce travels inside the
 * program text on stdin, where the code under test cannot reach it. So:
 *
 *   - a line without the nonce was written by something else: the run is TAMPERED;
 *   - a run that exits 0 without having written its closing record quit early: TAMPERED;
 *   - a run that wrote its closing record but did not exit 0 changed its own exit: TAMPERED.
 *
 * A tampered run scores 0 and marks the batch unclean. A crash or a kill from outside is not
 * tampering: the run simply did not finish, and what it did not report counts as failed.
 */
import type { JailOutcome } from './jail.ts';

export type ReportRecord = { t: string } & Record<string, unknown>;

export interface Report {
  records: ReportRecord[];
  /** Lines that were not valid records carrying the nonce. */
  foreign: number;
}

export function readReport(lines: readonly string[], nonce: string): Report {
  const records: ReportRecord[] = [];
  let foreign = 0;
  for (const line of lines) {
    let parsed: unknown;
    try {
      parsed = JSON.parse(line);
    } catch {
      foreign++;
      continue;
    }
    const record = parsed as Record<string, unknown> | null;
    if (record === null || typeof record !== 'object' || Array.isArray(record) || record.n !== nonce || typeof record.t !== 'string') {
      foreign++;
      continue;
    }
    records.push(record as ReportRecord);
  }
  return { records, foreign };
}

/** Parse one line only far enough to steer the watchdog. Never trusted for scoring. */
export function peek(line: string): { t: string; i?: number } | null {
  try {
    const record = JSON.parse(line) as { t?: unknown; i?: unknown };
    return typeof record.t === 'string' ? { t: record.t, ...(typeof record.i === 'number' ? { i: record.i } : {}) } : null;
  } catch {
    return null;
  }
}

/**
 * - `complete`: the run finished by itself and its report and exit agree.
 * - `tampered`: they do not, or something else wrote to the report channel.
 * - `killed`: the parent stopped it (a deadline or a size cap).
 * - `crashed`: it died by itself without finishing (an uncaught error, an out-of-memory abort).
 */
export type Ending = 'complete' | 'tampered' | 'killed' | 'crashed';

export function endingOf(report: Report, outcome: JailOutcome): Ending {
  if (report.foreign > 0) return 'tampered';
  const closings = report.records.filter((r) => r.t === 'end').length;
  const last = report.records[report.records.length - 1];
  if (closings > 1 || (closings === 1 && last?.t !== 'end')) return 'tampered';
  if (outcome.killed !== null) return 'killed';
  const exitedCleanly = outcome.exitCode === 0 && outcome.signal === null;
  if (closings === 1) return exitedCleanly ? 'complete' : 'tampered';
  return exitedCleanly ? 'tampered' : 'crashed';
}
