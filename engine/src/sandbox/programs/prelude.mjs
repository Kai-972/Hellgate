// The start of every jailed program. It is joined with one "bed" file and a call to `main`, and the
// whole text goes to the child over stdin (see programs.ts).
//
// Everything the program needs from the platform is captured here, before any untrusted module
// loads, so that a module which later replaces `JSON.stringify` or `process.exit` cannot change what
// this file does with them.
import * as fs from 'node:fs';

const writeSync = fs.writeSync;
const jsonStringify = JSON.stringify.bind(JSON);
const jsonParse = JSON.parse.bind(JSON);
const bufferFrom = Buffer.from.bind(Buffer);
const nowMs = performance.now.bind(performance);
const cpuUsage = process.cpuUsage.bind(process);
const exitProcess = process.exit.bind(process);
const setTimer = globalThis.setTimeout;
const clearTimer = globalThis.clearTimeout;
const waitCell = new Int32Array(new SharedArrayBuffer(4));

// Report channel: file descriptor 3. Every line carries the nonce the parent chose. A line without
// it was not written by this program, and the parent treats the run as tampered with.
function writeAll(text) {
  const bytes = bufferFrom(text);
  let offset = 0;
  while (offset < bytes.length) {
    try {
      offset += writeSync(3, bytes, offset, bytes.length - offset);
    } catch (err) {
      if (err && err.code === 'EAGAIN') Atomics.wait(waitCell, 0, 0, 2);
      else throw err;
    }
  }
}
function emit(nonce, record) {
  writeAll(jsonStringify({ n: nonce, ...record }) + '\n');
}
function firstLine(value, max = 200) {
  const text = value instanceof Error ? value.message : String(value);
  return text.split('\n')[0].slice(0, max);
}

// mulberry32, identical to core/rng.ts (a test compares the two).
function mulberry32(seed) {
  let a = seed | 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// Determinism: `Math.random` is the seeded stream, and the clock reads the same instant every time.
// `performance.now` is left alone, because elapsed time is measured with it.
const FROZEN_AT = 1767225600000; // 2026-01-01T00:00:00Z
function lockdown(seed) {
  const random = mulberry32(seed);
  Math.random = random;
  const RealDate = Date;
  class FrozenDate extends RealDate {
    constructor(...args) {
      if (args.length === 0) super(FROZEN_AT);
      else super(...args);
    }
    static now() {
      return FROZEN_AT;
    }
  }
  globalThis.Date = FrozenDate;
  return random;
}

// Stop a module from swapping out the built-ins that tests and reports lean on. Call it after
// `lockdown`, which replaces `Date` and `Math.random`.
function lockGlobals() {
  Object.freeze(JSON);
  Object.freeze(Math);
  Object.freeze(Reflect);
  for (const name of ['Date', 'Object', 'Array', 'Error', 'TypeError', 'RangeError', 'SyntaxError', 'ReferenceError', 'EvalError', 'URIError', 'AggregateError', 'JSON', 'Math', 'Number', 'String', 'Boolean', 'Symbol', 'Promise', 'Map', 'Set', 'WeakMap', 'WeakSet', 'Reflect', 'Proxy', 'RegExp', 'Function']) {
    const descriptor = Object.getOwnPropertyDescriptor(globalThis, name);
    if (descriptor && descriptor.configurable) Object.defineProperty(globalThis, name, { value: descriptor.value, writable: false, configurable: false });
  }
}

// At most a few small trace events leave the jail, and only in the final record.
function makeTrace(limit = 64) {
  const events = [];
  const trace = (event, data) => {
    if (events.length >= limit) return;
    let detail = null;
    try {
      const text = jsonStringify(data ?? null);
      detail = text.length <= 400 ? jsonParse(text) : { truncated: true };
    } catch {
      detail = { unserialisable: true };
    }
    events.push({ event: String(event).slice(0, 64), data: detail });
  };
  return { events, trace };
}
