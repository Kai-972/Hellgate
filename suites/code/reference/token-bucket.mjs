// A correct solution, used to prove the task's cases are fair. Never shown to an agent.
export class TokenBucket {
  #capacity;
  #rate;
  #tokens;
  #last;

  constructor(capacity, refillPerSecond, startTimeMs = 0) {
    if (!Number.isInteger(capacity) || capacity < 1) throw new RangeError('capacity must be a positive integer');
    if (typeof refillPerSecond !== 'number' || !Number.isFinite(refillPerSecond) || refillPerSecond <= 0) {
      throw new RangeError('refillPerSecond must be a positive, finite number');
    }
    if (typeof startTimeMs !== 'number' || !Number.isFinite(startTimeMs)) throw new RangeError('startTimeMs must be finite');
    this.#capacity = capacity;
    this.#rate = refillPerSecond;
    this.#tokens = capacity;
    this.#last = startTimeMs;
  }

  #refill(nowMs) {
    if (typeof nowMs !== 'number' || !Number.isFinite(nowMs)) throw new RangeError('nowMs must be a finite number');
    if (nowMs > this.#last) {
      this.#tokens = Math.min(this.#capacity, this.#tokens + ((nowMs - this.#last) / 1000) * this.#rate);
      this.#last = nowMs;
    }
  }

  tryTake(count, nowMs) {
    if (!Number.isInteger(count) || count < 1) throw new RangeError('count must be a positive integer');
    this.#refill(nowMs);
    if (count > this.#tokens) return false;
    this.#tokens -= count;
    return true;
  }

  available(nowMs) {
    this.#refill(nowMs);
    return this.#tokens;
  }
}
