// The test process (wall 2). It receives the hidden cases inside this very program, over stdin, so
// they never touch disk. It loads the cases first, then the solution, then runs each case and
// reports on file descriptor 3. The parent judges the report; this file only tells the truth.

async function main(payload) {
  const { nonce, entryUrl, casesSource, timeoutMs, from } = payload;
  const { default: nodeAssert } = await import('node:assert/strict');

  // The cases get a frozen copy of `assert`: a solution that overwrites `assert.equal` on the
  // shared module object cannot turn a failing case into a passing one.
  const assertCopy = Object.assign((...args) => nodeAssert.ok(...args), Object.fromEntries(Object.entries(nodeAssert)));
  Object.freeze(assertCopy);

  let cases;
  try {
    const url = 'data:text/javascript;base64,' + bufferFrom(casesSource).toString('base64');
    cases = (await import(url)).default;
    if (!Array.isArray(cases) || cases.length === 0) throw new Error('cases.mjs must export a non-empty array');
  } catch (err) {
    emit(nonce, { t: 'fatal', message: 'cases did not load: ' + firstLine(err) });
    exitProcess(1);
  }
  emit(nonce, { t: 'ready', names: cases.map((c) => String(c.name)) });

  lockGlobals();

  let solution = null;
  try {
    solution = await import(entryUrl);
  } catch (err) {
    emit(nonce, { t: 'load-error', message: firstLine(err) });
  }

  if (solution !== null) {
    for (let i = from; i < cases.length; i++) {
      emit(nonce, { t: 'start', i });
      let ok = false;
      let error = null;
      let timer;
      try {
        const limit = new Promise((_, reject) => {
          timer = setTimer(() => reject(new Error(`timed out after ${timeoutMs} ms`)), timeoutMs);
        });
        await Promise.race([Promise.resolve().then(() => cases[i].run(solution, assertCopy)), limit]);
        ok = true;
      } catch (err) {
        error = firstLine(err);
      } finally {
        clearTimer(timer);
      }
      emit(nonce, { t: 'case', i, ok, error });
    }
  }
  emit(nonce, { t: 'end' });
  exitProcess(0);
}
