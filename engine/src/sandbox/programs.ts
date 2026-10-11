/**
 * Assembling the programs that run inside jails.
 *
 * A program is the shared prelude, one bed, and a call to `main` with the payload. The payload is
 * embedded as `JSON.parse("…")` of a string, not as an object literal, so no key in it (a
 * `__proto__`, say) can be read as anything but data.
 */
import { readFileSync } from 'node:fs';

export type Bed = 'testbed' | 'learnerbed' | 'agentbed';

const read = (name: string): string => readFileSync(new URL(`./programs/${name}.mjs`, import.meta.url), 'utf8');
const sources = new Map<string, string>();
function source(name: string): string {
  let text = sources.get(name);
  if (text === undefined) sources.set(name, (text = read(name)));
  return text;
}

export function programFor(bed: Bed, payload: { nonce: string } & Record<string, unknown>): string {
  const literal = JSON.stringify(JSON.stringify(payload));
  return [
    source('prelude'),
    source(bed),
    // A crash in the bed itself is reported, not swallowed, and always exits non-zero.
    `const payload = JSON.parse(${literal});`,
    'main(payload).catch((err) => {',
    "  try { emit(payload.nonce, { t: 'fatal', message: firstLine(err) }); } catch {}",
    '  exitProcess(1);',
    '});',
    '',
  ].join('\n');
}
