# Merge overlapping intervals

Write `mergeIntervals(intervals)`. It takes an array of `[start, end]` pairs and returns the smallest array of
pairs that covers exactly the same numbers.

## Rules

- Two intervals **merge** when they overlap or **touch**: `[1, 3]` and `[3, 5]` become `[1, 5]`, and `[1, 3]`
  and `[4, 5]` stay separate. Merging repeats until no two intervals in the result merge. An interval inside
  another disappears into it.
- The result is **sorted by start**, and its pairs are **new arrays**. The input array and its pairs are
  never changed (no sorting in place, no mutation of a pair).
- The empty array gives `[]`. Numbers may be negative or fractional.

## Errors

- If `intervals` is not an array, or an item is not an array of exactly two numbers, throw a `TypeError`.
- If a number is not finite (`NaN`, `Infinity`), or a `start` is greater than its `end`, throw a `RangeError`.
  (A pair whose start equals its end is valid.) Check the type of every item before its values.

## Examples

```
mergeIntervals([[1, 3], [2, 6], [8, 10]])   // [[1, 6], [8, 10]]
mergeIntervals([[1, 4], [4, 5]])            // [[1, 5]]
mergeIntervals([[5, 6], [1, 2]])            // [[1, 2], [5, 6]]
mergeIntervals([[1, 10], [2, 3]])           // [[1, 10]]
```

## Output

Write the file `solution.mjs`. It must export `mergeIntervals`.
