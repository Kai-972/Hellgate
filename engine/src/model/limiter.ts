/**
 * A token-bucket limiter, one per provider. A free tier allows a few requests a minute, and a burst past
 * it returns 429s that cost more time than waiting would have. `acquire()` resolves when a request may
 * go; it never rejects. Requests are served in the order they asked.
 */
export class RateLimiter {
  private readonly perMs: number;
  private readonly capacity: number;
  private tokens: number;
  private last: number;
  private queue: Promise<void> = Promise.resolve();
  private readonly now: () => number;
  private readonly sleep: (ms: number) => Promise<void>;

  constructor(requestsPerMinute: number, options: { burst?: number; now?: () => number; sleep?: (ms: number) => Promise<void> } = {}) {
    this.perMs = requestsPerMinute / 60_000;
    this.capacity = Math.max(1, options.burst ?? Math.min(requestsPerMinute, 5));
    this.tokens = this.capacity;
    this.now = options.now ?? Date.now;
    this.sleep = options.sleep ?? ((ms) => new Promise((resolve) => setTimeout(resolve, ms)));
    this.last = this.now();
  }

  acquire(): Promise<void> {
    const turn = this.queue.then(async () => {
      for (;;) {
        const t = this.now();
        this.tokens = Math.min(this.capacity, this.tokens + (t - this.last) * this.perMs);
        this.last = t;
        if (this.tokens >= 1) {
          this.tokens -= 1;
          return;
        }
        await this.sleep(Math.ceil((1 - this.tokens) / this.perMs));
      }
    });
    this.queue = turn;
    return turn;
  }
}
