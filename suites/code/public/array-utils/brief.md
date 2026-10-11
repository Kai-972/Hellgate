# Chunk and flatten arrays

Write two functions. Neither modifies its input, and both return **new arrays**.

## `chunk(items, size)`

Splits `items` into consecutive groups of `size` elements. The last group holds what is left, so it may be
shorter. An empty array gives `[]`.

- If `items` is not an array, throw a `TypeError`.
- If `size` is not an integer of at least 1 (zero, negative, fractional, `NaN`, `Infinity`, or not a number),
  throw a `RangeError`. Check `items` first.

```
chunk([1, 2, 3, 4, 5], 2)   // [[1, 2], [3, 4], [5]]
chunk([1, 2, 3], 5)         // [[1, 2, 3]]
```

## `flatten(items, depth = 1)`

Returns a new array in which nested arrays are replaced by their elements, down to `depth` levels.

- `depth` defaults to `1`. `flatten(x, 0)` returns a shallow **copy** (still a new array).
- `depth` may be `Infinity`, which flattens every level.
- Only real arrays are flattened: strings, objects with a `length`, `Set`s and so on are kept as elements.
- Empty nested arrays vanish when they are flattened.
- If `items` is not an array, throw a `TypeError`. If `depth` is given and is not a non-negative integer or
  `Infinity` (negative, fractional, `NaN`, not a number), throw a `RangeError`. Check `items` first.
  (`undefined` for `depth` means "use the default".)

```
flatten([1, [2, [3, [4]]]])            // [1, 2, [3, [4]]]
flatten([1, [2, [3, [4]]]], 2)         // [1, 2, 3, [4]]
flatten([1, [2, [3, [4]]]], Infinity)  // [1, 2, 3, 4]
```

## Output

Write the file `solution.mjs`. It must export `chunk` and `flatten`.
