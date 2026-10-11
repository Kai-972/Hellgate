/**
 * Running one program inside a Node permission jail (ARCHITECTURE §6.5).
 *
 * What the jailed process can do is what the flags leave open: read one directory, nothing else.
 * No writes, no network, no child processes, no worker threads, no native addons, no inspector.
 * Its environment is scrubbed, because `process.env` would otherwise carry the parent's API keys.
 * The program is sent over stdin, so it is never on disk or in `argv` for the jail to read.
 *
 * Two channels come back: lines on file descriptor 3 (a report, checked by the caller against a
 * nonce) and, when asked for, Node's IPC channel (the model requests of an agent).
 */
import { spawn } from 'node:child_process';
import { StringDecoder } from 'node:string_decoder';

export interface JailControl {
  /** Send a message to the jailed program. Only meaningful when the jail was opened with `ipc`. */
  send(message: unknown): void;
  /** Kill the process this many ms from now, replacing any earlier deadline. `null` clears it. */
  setDeadline(ms: number | null): void;
  kill(reason: string): void;
}

export interface JailSpec {
  /** The only directory the program may read. It is also the working directory. */
  readDir: string;
  /** The program text, sent over stdin and run as an ES module. */
  program: string;
  ipc?: boolean;
  /** How long the program may run before the first `setDeadline` call replaces this. */
  deadlineMs: number;
  /** Old-space heap limit, in megabytes. */
  memoryMb?: number;
  onLine?: (line: string, control: JailControl) => void;
  onMessage?: (message: unknown, control: JailControl) => void;
}

export type KillReason = 'deadline' | 'output' | 'caller';

export interface JailOutcome {
  /** Every line the program wrote to file descriptor 3, in order. */
  lines: string[];
  exitCode: number | null;
  signal: NodeJS.Signals | null;
  /** Why the parent killed the process, or `null` if it ended by itself. */
  killed: { by: KillReason; detail: string } | null;
  /** The last few kilobytes of stderr. For diagnostics only: it never reaches a score or a record. */
  stderr: string;
  elapsedMs: number;
}

const REPORT_CAP_BYTES = 16 * 1024 * 1024;
const STDERR_KEEP_BYTES = 4096;
const DEFAULT_MEMORY_MB = 512;

/** Only the variables a jailed program needs. In particular, nothing secret. */
const JAIL_ENV: Readonly<Record<string, string>> = { TZ: 'UTC', LANG: 'C', LC_ALL: 'C', HELLGATE_JAIL: '1' };

export function jailFlags(readDir: string, memoryMb = DEFAULT_MEMORY_MB): string[] {
  return [
    '--permission',
    `--allow-fs-read=${readDir}`,
    `--max-old-space-size=${memoryMb}`,
    '--input-type=module',
    '-',
  ];
}

export function runJailed(spec: JailSpec): Promise<JailOutcome> {
  return new Promise((resolve, reject) => {
    const started = performance.now();
    const child = spawn(process.execPath, jailFlags(spec.readDir, spec.memoryMb), {
      cwd: spec.readDir,
      env: JAIL_ENV as Record<string, string>,
      stdio: spec.ipc ? ['pipe', 'pipe', 'pipe', 'pipe', 'ipc'] : ['pipe', 'pipe', 'pipe', 'pipe'],
      serialization: 'json',
      windowsHide: true,
    });

    const lines: string[] = [];
    let killed: JailOutcome['killed'] = null;
    let deadlineTimer: NodeJS.Timeout | undefined;
    let reportBytes = 0;
    let stderr = '';
    let closed = false;

    const kill = (by: KillReason, detail: string): void => {
      if (closed || killed !== null) return;
      killed = { by, detail };
      child.kill('SIGKILL');
    };

    const control: JailControl = {
      send(message) {
        if (!spec.ipc || closed || !child.connected) return;
        child.send(message as never, () => undefined);
      },
      setDeadline(ms) {
        clearTimeout(deadlineTimer);
        if (closed) return;
        deadlineTimer = ms === null ? undefined : setTimeout(() => kill('deadline', `no result within ${ms} ms`), ms);
      },
      kill: (reason) => kill('caller', reason),
    };
    control.setDeadline(spec.deadlineMs);

    // fd 3: complete lines only, with a hard cap so a flood cannot exhaust memory.
    const decoder = new StringDecoder('utf8');
    let partial = '';
    (child.stdio[3] as NodeJS.ReadableStream).on('data', (chunk: Buffer) => {
      reportBytes += chunk.length;
      if (reportBytes > REPORT_CAP_BYTES) return kill('output', `more than ${REPORT_CAP_BYTES} bytes on the report channel`);
      partial += decoder.write(chunk);
      let at: number;
      while ((at = partial.indexOf('\n')) >= 0) {
        const line = partial.slice(0, at);
        partial = partial.slice(at + 1);
        lines.push(line);
        spec.onLine?.(line, control);
      }
    });
    // A partial last line (no newline) is kept: the caller counts it as a forged or damaged record.
    (child.stdio[3] as NodeJS.ReadableStream).on('end', () => {
      partial += decoder.end();
      if (partial.length > 0) lines.push(partial);
    });

    child.stdout!.on('data', () => undefined); // drained and dropped
    child.stderr!.on('data', (chunk: Buffer) => {
      stderr = (stderr + chunk.toString('utf8')).slice(-STDERR_KEEP_BYTES);
    });
    if (spec.ipc) {
      child.on('message', (message) => spec.onMessage?.(message, control));
    }

    child.stdin!.on('error', () => undefined); // the program may exit before it reads everything
    child.stdin!.end(spec.program);

    child.on('error', (err) => {
      clearTimeout(deadlineTimer);
      closed = true;
      reject(err);
    });
    child.on('close', (exitCode, signal) => {
      closed = true;
      clearTimeout(deadlineTimer);
      resolve({ lines, exitCode, signal, killed, stderr, elapsedMs: Math.round(performance.now() - started) });
    });
  });
}
