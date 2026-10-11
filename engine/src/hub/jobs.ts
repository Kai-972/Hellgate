/**
 * Jobs: long operations a client starts over HTTP and follows as a stream of events (PROTOCOL §10.1).
 * Only one runs at a time, because jobs spend compute and, in the `code` domain, model quota.
 *
 * Every event is kept, so a client that connects late, or reconnects, is replayed from the start and
 * sees the same stream as one that was there all along.
 */
import { randomBytes } from 'node:crypto';

export type JobState = 'queued' | 'running' | 'done' | 'failed';

export interface JobEvent {
  event: string;
  data: unknown;
}

export class Job {
  readonly id = randomBytes(8).toString('hex');
  state: JobState = 'queued';
  result: unknown = null;
  error: string | null = null;
  readonly events: JobEvent[] = [];
  private readonly listeners = new Set<(e: JobEvent | null) => void>();

  readonly kind: string;
  readonly tree: string;

  constructor(kind: string, tree: string) {
    this.kind = kind;
    this.tree = tree;
  }

  emit(event: string, data: unknown): void {
    const e = { event, data };
    this.events.push(e);
    for (const l of this.listeners) l(e);
  }

  get finished(): boolean {
    return this.state === 'done' || this.state === 'failed';
  }

  /** Replay everything so far, then follow live. `listener(null)` means the job is over. Returns an unsubscribe function. */
  follow(listener: (e: JobEvent | null) => void): () => void {
    for (const e of this.events) listener(e);
    if (this.finished) {
      listener(null);
      return () => undefined;
    }
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  /** @internal */
  close(): void {
    for (const l of this.listeners) l(null);
    this.listeners.clear();
  }
}

export class JobRunner {
  readonly jobs = new Map<string, Job>();
  current: Job | null = null;

  /** Start `work` unless a job is already running; returns the running job's id in that case. */
  start(kind: string, tree: string, work: (job: Job) => Promise<unknown>): { job: Job } | { busy: Job } {
    if (this.current !== null && !this.current.finished) return { busy: this.current };
    const job = new Job(kind, tree);
    this.jobs.set(job.id, job);
    this.current = job;
    job.state = 'running';
    work(job).then(
      (result) => {
        job.result = result;
        job.state = 'done';
        job.emit('done', { result });
        job.close();
      },
      (err: unknown) => {
        job.error = err instanceof Error ? err.message : String(err);
        job.state = 'failed';
        job.emit('error', { message: job.error });
        job.close();
      },
    );
    return { job };
  }
}
