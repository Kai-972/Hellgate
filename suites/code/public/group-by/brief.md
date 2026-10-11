# Group items by a key

Write `groupBy(items, key)`. It sorts the items of an array into groups and returns a `Map` from each group's
key to the array of its items.

## Rules

- `key` is either a **string**, the name of a property to read from each item (`item[key]`), or a **function**
  called as `key(item, index)` for each item, where `index` is the item's position in `items`.
- The result is a `Map`. Its entries are in the order in which each key was **first seen**. Inside a group the
  items keep their original order.
- Keys are compared the way a `Map` compares them: `NaN` makes one group, `1` and `"1"` are different groups,
  and `undefined` is an ordinary key (an item whose property is missing goes to the `undefined` group).
- Items are never copied or changed, and `items` is not modified.
- If a string `key` is used on an item that is `null` or `undefined`, that item goes to the `undefined` group.
- An empty array gives an empty `Map`.

## Errors

If `items` is not an array, or `key` is neither a string nor a function, throw a `TypeError`.

## Examples

```
groupBy([1, 2, 3, 4, 5], (n) => n % 2)
// Map { 1 => [1, 3, 5], 0 => [2, 4] }

groupBy([{ t: "a" }, { t: "b" }, { t: "a" }], "t")
// Map { "a" => [{ t: "a" }, { t: "a" }], "b" => [{ t: "b" }] }
```

## Output

Write the file `solution.mjs`. It must export `groupBy`.
