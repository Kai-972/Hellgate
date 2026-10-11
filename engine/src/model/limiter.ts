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

/**
 * A tokens-per-minute limiter over a sliding minute. Free tiers cap tokens as well as requests, and a
 * 429 for tokens costs a long wait. `reserve(estimate)` resolves when the minute has room for the
 * estimate, in the order asked, and returns a function that swaps the estimate for what was really
 * used. A request larger than the whole limit waits for an empty minute and then goes alone.
 */
export class TokenLimiter {
  private readonly limit: number;
  private readonly spent: { at: number; tokens: number }[] = [];
  private queue: Promise<void> = Promise.resolve();
  private readonly now: () => number;
  private readonly sleep: (ms: number) => Promise<void>;

  constructor(tokensPerMinute: number, options: { now?: () => number; sleep?: (ms: number) => Promise<void> } = {}) {
    this.limit = tokensPerMinute;
    this.now = options.now ?? Date.now;
    this.sleep = options.sleep ?? ((ms) => new Promise((resolve) => setTimeout(resolve, ms)));
  }

  private used(): number {
    const cutoff = this.now() - 60_000;
    while (this.spent.length > 0 && this.spent[0]!.at <= cutoff) this.spent.shift();
    return this.spent.reduce((n, s) => n + s.tokens, 0);
  }

  reserve(estimate: number): Promise<(actual: number) => void> {
    const entry = { at: 0, tokens: Math.max(0, estimate) };
    const turn = this.queue.then(async () => {
      for (;;) {
        const used = this.used();
        if (used === 0 || used + entry.tokens <= this.limit) break;
        // wait until the oldest spend leaves the window, then look again
        await this.sleep(Math.max(50, this.spent[0]!.at + 60_000 - this.now() + 10));
      }
      entry.at = this.now();
      this.spent.push(entry);
    });
    this.queue = turn;
    return turn.then(() => (actual: number) => {
      entry.tokens = Math.max(0, actual);
    });
  }
}
