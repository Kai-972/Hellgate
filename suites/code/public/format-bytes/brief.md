# Format a byte count for people

Write `formatBytes(bytes, options)`. It turns a number of bytes into a short text such as `"1.5 kB"`.

## Options

- `binary` (default `false`): `false` uses powers of **1000** with the units `B kB MB GB TB PB`; `true` uses
  powers of **1024** with `B KiB MiB GiB TiB PiB`.
- `decimals` (default `1`): how many digits follow the decimal point, an integer from `0` to `3`.

## Rules

- Below one thousand (or 1024 when `binary`) the number is shown as it is, as a whole number, with no
  decimals: `"999 B"`, `"0 B"`. A fractional byte count below that is rounded to the nearest integer
  (half up).
- Otherwise the number is divided by the base until it is below the base (or the unit is `PB`/`PiB`, the
  largest), and written with exactly `decimals` digits after the point, **including trailing zeros**
  (`"1.0 kB"`, not `"1 kB"`), rounded half up. With `decimals` of `0` there is no point: `"2 kB"`.
- **Rounding can reach the base.** If rounding makes the number equal to the base (for example 999950 bytes is
  999.95 kB, which with one decimal rounds to 1000.0), move up one unit instead: `"1.0 MB"`. This does not
  apply to `PB`/`PiB`, which has no larger unit: `1e18` bytes is `"1000.0 PB"`.
- The number and the unit are separated by one space.

## Errors

- If `bytes` is not a number, throw a `TypeError`.
- If `bytes` is negative or not finite, throw a `RangeError`.
- If `decimals` is given and is not an integer from 0 to 3, throw a `RangeError`.

## Examples

```
formatBytes(999)                          // "999 B"
formatBytes(1536)                         // "1.5 kB"
formatBytes(1536, { binary: true })       // "1.5 KiB"
formatBytes(999950)                       // "1.0 MB"
formatBytes(1500, { decimals: 0 })        // "2 kB"
```

## Output

Write the file `solution.mjs`. It must export `formatBytes`.
