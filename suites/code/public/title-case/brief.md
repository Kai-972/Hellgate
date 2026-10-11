# Convert text to title case

Write `titleCase(text)`. It returns the text with each word capitalised according to the rules below.
Whitespace is never changed: every run of spaces, tabs and newlines in the input appears unchanged in
the output. Only the words (the runs of non-whitespace characters) change.

## Rules, applied to each word in this order

1. **Acronyms stay as they are.** A word made only of capital letters `A` to `Z`, with at least two of
   them (`NASA`, `USB`), is left exactly as written.
2. **Hyphenated words.** A word that contains `-` is split at every hyphen, each part is treated by the
   rules below as a word of its own (a part that is an acronym stays), and the parts are joined again
   with hyphens. The small-word rule (4) does not apply to parts.
3. **Capitalising.** Otherwise the word is first turned entirely to lowercase, and then its first letter
   is made a capital. "Letter" means `a` to `z` only: a leading digit or punctuation is skipped, so
   `(hello` becomes `(Hello` and `3rd` becomes `3Rd`.
4. **Small words.** A word is a *small word* when the **whole word**, in lowercase, is one of:
   `a an the and but or nor for so yet of in on at to by up as`. A small word is written in lowercase,
   **unless** it is the first or the last word of the text, where rule 3 applies. (So `of,` with a comma
   is not a small word and is capitalised.)

## Errors

If `text` is not a string, throw a `TypeError`. An empty string gives an empty string.

## Examples

```
titleCase("the lord of the rings")      // "The Lord of the Rings"
titleCase("a tale of two cities")       // "A Tale of Two Cities"
titleCase("NASA and the e-mail era")    // "NASA and the E-Mail Era"
titleCase("  what  is   this  for  ")   // "  What  Is   This  For  "
```

## Output

Write the file `solution.mjs`. It must export `titleCase`.
