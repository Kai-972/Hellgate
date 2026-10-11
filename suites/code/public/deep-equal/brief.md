# Deep equality of plain data

Write `deepEqual(a, b)`. It returns `true` when two values are equal by the rules below, and `false` otherwise.
It never throws. The inputs are never cyclic.

## Rules

- **Primitives:** equal when they are the same value, except that `NaN` equals `NaN`, and `+0` equals `-0`.
  `null` and `undefined` are different from each other and from everything else. `1` and `"1"` are different.
- **Arrays** are equal when they have the same length and their elements are pairwise deeply equal. An array
  is never equal to a non-array (not to an object with the same keys, nor to an array-like).
- **Plain objects** are equal when they have the same set of own enumerable string keys and each key's values
  are deeply equal. Key order does not matter. A key whose value is `undefined` still counts as a key:
  `{a: undefined}` is not equal to `{}`.
- **Dates** are equal when they hold the same time (`getTime()`); an invalid date equals another invalid date.
  A Date is never equal to a non-Date.
- **Maps** are equal when they have the same size and every key of one is present in the other (keys compared
  as a `Map` does, by identity or SameValueZero, **not** deeply) with deeply equal values.
- **Sets** are equal when they have the same size and every member of one is a member of the other (compared
  as a `Set` does, **not** deeply).
- **Functions** are equal only when they are the very same function.
- Values of different kinds (an array and a Map, a Date and an object, an object and a Set) are never equal.

## Examples

```
deepEqual({ a: [1, { b: 2 }] }, { a: [1, { b: 2 }] })   // true
deepEqual(NaN, NaN)                                      // true
deepEqual({ a: undefined }, {})                          // false
deepEqual(new Set([1, 2]), new Set([2, 1]))              // true
```

## Output

Write the file `solution.mjs`. It must export `deepEqual`.
