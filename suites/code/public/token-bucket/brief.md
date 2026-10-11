# A token-bucket rate limiter with an explicit clock

Write the class `TokenBucket`. It limits how fast something may happen. Time is passed in
by the caller as a number of milliseconds, so the class can be tested without waiting.

## Behaviour

- `new TokenBucket(capacity, refillPerSecond, startTimeMs = 0)` creates a bucket that is
  **full**: it holds `capacity` tokens at time `startTimeMs`.
- Tokens refill continuously at `refillPerSecond` tokens per second. Fractions accumulate: after
  500 ms at 1 token per second the bucket has gained exactly 0.5 tokens. The bucket never holds
  more than `capacity`.
- `available(nowMs)` returns the number of tokens (possibly fractional) the bucket holds at
  `nowMs`. It takes nothing.
- `tryTake(count, nowMs)` first brings the bucket up to `nowMs`. If the bucket then holds at
  least `count` tokens, it removes them and returns `true`. Otherwise it returns `false` and
  removes **nothing**. A `count` larger than `capacity` can never succeed: return `false`.
- **Time never goes backwards.** If `nowMs` is earlier than the latest time the bucket has already
  seen (in any call), no tokens are added and none are removed, and the bucket's clock does not
  move back. The latest time seen is the largest `nowMs` (or `startTimeMs`) given so far.

## Errors

Throw a `RangeError` when:
- `capacity` is not a positive integer;
- `refillPerSecond` is not a positive, finite number;
- `startTimeMs` is not a finite number;
- `count` is not a positive integer;
- `nowMs` is not a finite number.

## Example

```js
const bucket = new TokenBucket(10, 2);   // 10 tokens, refills 2 per second, starts at time 0
bucket.tryTake(10, 0);                   // true, the bucket is now empty
bucket.available(1000);                  // 2
bucket.tryTake(5, 2500);                 // true: 5 tokens have refilled by 2500 ms
bucket.tryTake(1, 2500);                 // false
```

## Output

Write the file `solution.mjs`. It must export `TokenBucket`.
