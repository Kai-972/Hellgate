// The agent jail (wall 1). The agent gets the task brief and a kit, and returns solution files. Its
// only way to the model is the IPC channel, served by the parent, which owns the budget. The
// channel's `send` is captured here and removed from `process` before the agent's code loads.

async function main(payload) {
  const { nonce, seed, entryUrl, brief, remaining } = payload;
  const send = process.send.bind(process);
  delete process.send;
  const random = lockdown(seed);
  const { events, trace } = makeTrace();

  let left = { ...remaining };
  let nextId = 1;
  const pending = new Map();
  process.on('message', (message) => {
    const slot = message && pending.get(message.id);
    if (!slot) return;
    pending.delete(message.id);
    if (message.remaining) left = { ...message.remaining };
    if (message.error !== undefined) slot.reject(new Error(String(message.error)));
    else slot.resolve(message.reply);
  });

  const model = Object.freeze({
    generate(request) {
      return new Promise((resolve, reject) => {
        const id = nextId++;
        pending.set(id, { resolve, reject });
        try {
          send({ kind: 'model', id, request: jsonParse(jsonStringify(request)) });
        } catch (err) {
          pending.delete(id);
          reject(new Error('the request could not be sent: ' + firstLine(err)));
        }
      });
    },
  });
  const kit = Object.freeze({ model, budget: Object.freeze({ remaining: () => ({ ...left }) }), trace, random });

  emit(nonce, { t: 'begin' });
  lockGlobals();

  let mod;
  try {
    mod = await import(entryUrl);
    if (typeof mod.solve !== 'function') throw new Error('agent/index.ts does not export solve()');
  } catch (err) {
    emit(nonce, { t: 'load-error', message: firstLine(err) });
    emit(nonce, { t: 'end' });
    exitProcess(0);
  }

  let answer;
  try {
    answer = await mod.solve(brief, kit);
  } catch (err) {
    emit(nonce, { t: 'solve-error', message: firstLine(err), trace: events });
    emit(nonce, { t: 'end' });
    exitProcess(0);
  }
  emit(nonce, { t: 'answer', files: answer && answer.files, trace: events });
  emit(nonce, { t: 'end' });
  exitProcess(0);
}
