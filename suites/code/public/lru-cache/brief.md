# A least-recently-used cache

Write the class `LruCache`. It stores up to `capacity` key and value pairs and, when it is full and a new key
arrives, throws away the entry that was **used least recently**.

## Interface

- `new LruCache(capacity)`: `capacity` must be an integer of at least 1, otherwise throw a `RangeError`.
- `get(key)`: returns the value, or `undefined` if the key is absent. A successful `get` makes the key the
  **most recently used**.
- `set(key, value)`: stores the value and makes the key the most recently used. If the key already exists its
  value is replaced and it becomes the most recently used (the size does not grow). If the cache is full and
  the key is new, the least recently used entry is removed first. Returns the cache itself, so calls chain.
- `has(key)`: true if the key is present. It does **not** change the order of use.
- `delete(key)`: removes the key and returns `true`, or returns `false` if it was absent.
- `size`: a read-only property: the number of entries held.
- `keys()`: a new array of the keys, from the **least** recently used to the **most** recently used.

Keys are compared the way a `Map` compares them (so `NaN` is a usable key, and `1` and `"1"` are different).
A value may be `undefined`: `has` still reports the key as present.

## Example

```
const c = new LruCache(2);
c.set("a", 1).set("b", 2);
c.get("a");        // 1, and "a" is now the most recent
c.set("c", 3);     // evicts "b"
c.keys();          // ["a", "c"]
```

## Output

Write the file `solution.mjs`. It must export the class `LruCache`.
