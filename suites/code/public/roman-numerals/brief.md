# Roman numerals, strictly

Write two functions.

## `toRoman(n)`

Converts an integer from 1 to 3999 to its Roman numeral, using the standard subtractive forms:
`I V X L C D M`, with `IV` 4, `IX` 9, `XL` 40, `XC` 90, `CD` 400, `CM` 900. Each numeral is written in its
one canonical form (`4` is `IV`, never `IIII`).

- If `n` is not a number, throw a `TypeError`.
- If `n` is a number but not an integer in `1..3999` (zero, negative, fractional, `NaN`, too large), throw a
  `RangeError`.

## `fromRoman(text)`

Converts a Roman numeral back to a number, and is **strict**: it accepts only the one canonical spelling that
`toRoman` produces, so `fromRoman(toRoman(n))` is `n` for every `n` and nothing else is accepted.

- Letters must be uppercase. Surrounding whitespace is not allowed.
- If `text` is not a string, throw a `TypeError`.
- If `text` is empty, or is not the canonical numeral of some integer in `1..3999`, throw a `RangeError`.
  That rejects `IIII`, `VX`, `IC`, `XM`, `VV`, `IIX`, `MMMM`, `iv`, and so on.

## Examples

```
toRoman(1994)        // "MCMXCIV"
toRoman(4)           // "IV"
fromRoman("MCMXCIV") // 1994
fromRoman("IIII")    // throws RangeError
```

## Output

Write the file `solution.mjs`. It must export `toRoman` and `fromRoman`.
