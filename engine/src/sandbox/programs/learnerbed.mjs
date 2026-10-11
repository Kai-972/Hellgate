// The learner jail (the whole of the ml sandbox). The learner is given the train set and the test
// INPUTS and returns predictions. The test labels are not in this process and never were: the
// parent holds them and does the scoring.

async function main(payload) {
  const { nonce, seed, entryUrl, task } = payload;
  const random = lockdown(seed);
  const { events, trace } = makeTrace();
  const startedAt = nowMs();
  const cpuStart = cpuUsage();
  const kit = Object.freeze({ random, trace, elapsedMs: () => nowMs() - startedAt });

  emit(nonce, { t: 'begin' });
  lockGlobals();

  let mod;
  try {
    mod = await import(entryUrl);
    if (typeof mod.fit !== 'function') throw new Error('learner/index.ts does not export fit()');
  } catch (err) {
    emit(nonce, { t: 'load-error', message: firstLine(err) });
    emit(nonce, { t: 'end' });
    exitProcess(0);
  }

  let predictions;
  try {
    const answer = await mod.fit(task, kit);
    predictions = Array.from(answer.y);
  } catch (err) {
    emit(nonce, { t: 'fit-error', message: firstLine(err), trace: events });
    emit(nonce, { t: 'end' });
    exitProcess(0);
  }
  // The budget is CPU time, not wall-clock time: it does not change when the machine is busy.
  const used = cpuUsage(cpuStart);
  const cpuMs = Math.round((used.user + used.system) / 1000);
  emit(nonce, { t: 'result', y: predictions, ms: Math.round(nowMs() - startedAt), cpuMs, trace: events });
  emit(nonce, { t: 'end' });
  exitProcess(0);
}
