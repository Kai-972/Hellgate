# Turn text into a URL slug

Write `slugify(text, options)`. It turns any text into a lowercase, URL-safe slug.

## Rules

1. Normalise the text with Unicode **NFKD**, then delete the combining marks (code points
   U+0300 to U+036F). `"Crème Brûlée"` becomes `"Creme Brulee"`, and the ligature `"ﬁ"` becomes `"fi"`.
2. Lowercase everything.
3. Every run of one or more characters that are not a letter `a` to `z` or a digit `0` to `9`
   becomes a single hyphen. This includes spaces, punctuation, underscores and letters of any
   other alphabet.
4. Remove hyphens from the start and the end.
5. If nothing is left, return the empty string.
6. `options.maxLength`, when given, cuts the slug to at most that many characters. After
   cutting, remove any hyphens at the end again. Without `maxLength` the slug is never cut.

## Errors

- If `text` is not a string, throw a `TypeError`.
- If `options.maxLength` is given (not `undefined`) and is not a positive integer, throw a
  `RangeError`.

## Examples

```
slugify("Hello, World!")                      // "hello-world"
slugify("  --Already--slugged--  ")           // "already-slugged"
slugify("Crème Brûlée")                       // "creme-brulee"
slugify("Hello World", { maxLength: 6 })      // "hello"
slugify("日本語")                              // ""
```

## Output

Write the file `solution.mjs`. It must export `slugify`.
