# Compare semantic versions

Write `compareSemver(a, b)`. It compares two semantic version strings and returns `-1` if `a` is lower than
`b`, `1` if `a` is higher, and `0` if they have the same precedence.

## Format

`MAJOR.MINOR.PATCH`, optionally followed by `-PRERELEASE` and then `+BUILD`, optionally preceded by a single
lowercase `v`.

- MAJOR, MINOR and PATCH are non-negative integers written without leading zeros (`0` is fine, `01` is not).
- PRERELEASE and BUILD are dot-separated identifiers made of `A-Z`, `a-z`, `0-9` and `-`. No identifier is
  empty. A **numeric** prerelease identifier (digits only) has no leading zeros; build identifiers may.

## Precedence

1. Compare MAJOR, then MINOR, then PATCH, as numbers (`1.10.0` is higher than `1.9.0`).
2. A version **with** a prerelease is lower than the same version without one: `1.0.0-rc.1 < 1.0.0`.
3. Two prereleases are compared identifier by identifier, left to right:
   - two numeric identifiers are compared as numbers;
   - a numeric identifier is lower than an alphanumeric one;
   - two alphanumeric identifiers are compared as plain text, character by character (uppercase before
     lowercase, as in ASCII);
   - if all shared identifiers are equal, the one with **fewer** identifiers is lower.
4. The BUILD part, and a leading `v`, are ignored: `1.0.0+a` and `v1.0.0` have the same precedence.

## Errors

If either argument is not a string, throw a `TypeError`. If either is not a valid version, throw a
`RangeError`.

## Examples

```
compareSemver("1.9.0", "1.10.0")             // -1
compareSemver("1.0.0-alpha", "1.0.0")        // -1
compareSemver("1.0.0-beta.2", "1.0.0-beta.11") // -1
compareSemver("v2.0.0+build5", "2.0.0")      // 0
```

## Output

Write the file `solution.mjs`. It must export `compareSemver`.
