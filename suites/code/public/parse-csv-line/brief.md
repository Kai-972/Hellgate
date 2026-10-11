# Parse one line of CSV

Write `parseCsvLine(line)`. It splits one CSV record into its fields and returns them as an array of strings.

## Format

- Fields are separated by commas. Whitespace is part of a field and is **never trimmed**.
- A field may be **quoted**: it then starts with `"` and ends with the matching `"`. Inside a quoted field a
  comma is just a character, and two quotes in a row (`""`) stand for one literal quote character. A quoted
  field may contain a newline.
- An **unquoted** field contains no `"` at all.
- A comma always starts a new field, so `a,,c` has an empty middle field and a line ending in a comma has an
  empty last field.
- An empty line is one empty field: `""` gives `[""]`. The line `,` gives `["", ""]`.

## Errors

Throw a `RangeError` when the line is malformed: a `"` inside an unquoted field, a quoted field that is never
closed, or any character between a closing quote and the next comma (or the end of the line).
If `line` is not a string, throw a `TypeError`.

## Examples

```
parseCsvLine('a,b,c')              // ["a", "b", "c"]
parseCsvLine('a,"b,c",d')          // ["a", "b,c", "d"]
parseCsvLine('"say ""hi""",x')     // ['say "hi"', "x"]
parseCsvLine(' a , b ')            // [" a ", " b "]
parseCsvLine('a"b')                // throws RangeError
```

## Output

Write the file `solution.mjs`. It must export `parseCsvLine`.
