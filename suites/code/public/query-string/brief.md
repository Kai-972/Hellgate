# Parse a URL query string

Write `parseQuery(query)`. It turns a query string such as `"?a=1&b=2&a=3"` into an object.

## Rules

- A single leading `?` is ignored. The text is split at `&` into pairs; **empty pairs are skipped**
  (`a=1&&b=2`, a trailing `&`).
- Each pair is split at its **first** `=` into a key and a value. A pair with no `=` has the empty string as
  its value, and `=x` has the empty string as its key. (An empty key is kept: it is a key like any other.)
- Keys and values are decoded: every `+` becomes a space, then percent-escapes are decoded as UTF-8
  (`%C3%A9` is `é`). Decode **after** splitting, so an encoded `%26` or `%3D` never splits anything.
- A key that appears **more than once** gives an **array** of its values, in the order they appear. A key
  that appears once gives a plain string.
- A key ending in `[]` (after decoding) always gives an array, with the `[]` removed from the key: `a[]=1`
  gives `{ a: ["1"] }`. If the same name also appears without `[]`, all its values go into the one array, in
  order.
- The result has **no prototype** (`Object.create(null)`), so a key such as `__proto__` is an ordinary key.
  Keys appear in the order they were first seen.

## Errors

- If `query` is not a string, throw a `TypeError`.
- If a percent-escape is malformed, throw a `RangeError`.

## Examples

```
parseQuery("?a=1&b=2")          // { a: "1", b: "2" }
parseQuery("a=1&a=2&a=3")       // { a: ["1", "2", "3"] }
parseQuery("q=hello+world%21")  // { q: "hello world!" }
parseQuery("tag[]=x")           // { tag: ["x"] }
parseQuery("flag&n=")           // { flag: "", n: "" }
```

## Output

Write the file `solution.mjs`. It must export `parseQuery`.
