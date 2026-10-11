// Hidden test cases. The agent never sees this file.
export default [
  { name: 'a new bucket is full', run: (m, a) => a.equal(new m.TokenBucket(5, 1).available(0), 5) },
  { name: 'taking tokens reduces what is available', run: (m, a) => {
    const b = new m.TokenBucket(5, 1);
    a.equal(b.tryTake(2, 0), true);
    a.equal(b.available(0), 3);
  } },
  { name: 'an empty bucket refuses', run: (m, a) => {
    const b = new m.TokenBucket(5, 1);
    a.equal(b.tryTake(5, 0), true);
    a.equal(b.tryTake(1, 0), false);
    a.equal(b.available(0), 0);
  } },
  { name: 'tokens refill over time', run: (m, a) => {
    const b = new m.TokenBucket(10, 2);
    a.equal(b.tryTake(10, 0), true);
    a.equal(b.available(1000), 2);
    a.equal(b.available(2500), 5);
    a.equal(b.tryTake(5, 2500), true);
    a.equal(b.tryTake(1, 2500), false);
  } },
  { name: 'the bucket never holds more than its capacity', run: (m, a) => {
    const b = new m.TokenBucket(4, 10);
    a.equal(b.tryTake(4, 0), true);
    a.equal(b.available(10000), 4);
  } },
  { name: 'fractions accumulate', run: (m, a) => {
    const b = new m.TokenBucket(3, 1);
    a.equal(b.tryTake(3, 0), true);
    a.equal(b.available(500), 0.5);
    a.equal(b.tryTake(1, 500), false);
    a.equal(b.available(1000), 1);
    a.equal(b.tryTake(1, 1000), true);
  } },
  { name: 'a refused request takes nothing', run: (m, a) => {
    const b = new m.TokenBucket(5, 1);
    a.equal(b.tryTake(3, 0), true);
    a.equal(b.tryTake(4, 0), false);
    a.equal(b.available(0), 2);
  } },
  { name: 'a request above capacity can never succeed', run: (m, a) => {
    const b = new m.TokenBucket(5, 1);
    a.equal(b.tryTake(6, 0), false);
    a.equal(b.available(0), 5);
  } },
  { name: 'time never goes backwards', run: (m, a) => {
    const b = new m.TokenBucket(5, 1);
    a.equal(b.tryTake(5, 1000), true);
    a.equal(b.tryTake(1, 500), false);
    a.equal(b.available(500), 0);
    // The clock must not have moved back to 500: one second after 1000 gives exactly one token.
    a.equal(b.available(2000), 1);
  } },
  { name: 'a start time other than zero', run: (m, a) => {
    const b = new m.TokenBucket(2, 1, 5000);
    a.equal(b.available(5000), 2);
    a.equal(b.tryTake(2, 5000), true);
    a.equal(b.available(1000), 0);
    a.equal(b.available(6000), 1);
  } },
  { name: 'bad constructor arguments throw RangeError', run: (m, a) => {
    for (const args of [[0, 1], [-1, 1], [2.5, 1], [5, 0], [5, -1], [5, NaN], [5, Infinity], [5, 1, NaN], ['5', 1]]) {
      a.throws(() => new m.TokenBucket(...args), RangeError, JSON.stringify(args));
    }
  } },
  { name: 'bad call arguments throw RangeError', run: (m, a) => {
    const b = new m.TokenBucket(5, 1);
    for (const count of [0, -1, 1.5, '1', NaN]) a.throws(() => b.tryTake(count, 0), RangeError);
    for (const now of [NaN, Infinity, '0']) {
      a.throws(() => b.tryTake(1, now), RangeError);
      a.throws(() => b.available(now), RangeError);
    }
  } },
];
