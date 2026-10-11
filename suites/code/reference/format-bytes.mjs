// A correct solution, used to prove the task's cases are fair. Never shown to an agent.
export function formatBytes(bytes, options = {}) {
  if (typeof bytes !== 'number') throw new TypeError('bytes must be a number');
  if (!Number.isFinite(bytes) || bytes < 0) throw new RangeError('bytes must be a finite, non-negative number');
  const { binary = false, decimals = 1 } = options;
  if (!Number.isInteger(decimals) || decimals < 0 || decimals > 3) throw new RangeError('decimals must be an integer from 0 to 3');
  const base = binary ? 1024 : 1000;
  const units = binary ? ['B', 'KiB', 'MiB', 'GiB', 'TiB', 'PiB'] : ['B', 'kB', 'MB', 'GB', 'TB', 'PB'];
  const factor = 10 ** decimals;
  const half = (x) => Math.floor(x * factor + 0.5) / factor;
  if (bytes < base) {
    const whole = Math.floor(bytes + 0.5);
    if (whole < base) return `${whole} B`;
  }
  let value = bytes;
  let unit = 0;
  while (value >= base && unit < units.length - 1) { value /= base; unit++; }
  if (unit === 0) { value = bytes / base; unit = 1; }
  let rounded = half(value);
  while (rounded >= base && unit < units.length - 1) { rounded = half(rounded / base); unit++; }
  return `${rounded.toFixed(decimals)} ${units[unit]}`;
}
