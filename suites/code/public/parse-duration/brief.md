# Parse a duration string into milliseconds

Write `parseDuration(input)`. It reads a text such as `"1h30m"` and returns the total number
of milliseconds.

## Format

- A duration is one or more **components**. A component is a number followed immediately by a
  unit, with nothing in between: `30m`, `1.5h`, `250ms`.
- Units are lowercase only: `ms` (millisecond), `s` (second), `m` (minute), `h` (hour),
  `d` (day) and `w` (week). One week is seven days.
- A number is digits with an optional single decimal point followed by digits: `10`, `0.25`,
  `1.5`. A sign, an exponent, `.5` and `5.` are all invalid.
- Components may be separated by whitespace, and the whole text may have whitespace at the start
  and end. There must be no whitespace between a number and its unit.
- The components may come in any order, but each unit may appear **at most once**.
- The result is the sum of all components, rounded to the nearest whole millisecond
  (`Math.round`). `"0s"` is valid and gives `0`.

## Errors

- If `input` is not a string, throw a `TypeError`.
- If `input` is empty or only whitespace, or does not follow the format exactly, or repeats a
  unit, throw a `RangeError`.

## Examples

```
parseDuration("250ms")      // 250
parseDuration("1h30m")      // 5400000
parseDuration("2d 4h")      // 187200000
parseDuration("1.5h")       // 5400000
parseDuration("30m1h")      // 5400000
parseDuration("5m5ms")      // 300005
parseDuration("1h2h")       // throws RangeError
```

## Output

Write the file `solution.mjs`. It must export `parseDuration`.
