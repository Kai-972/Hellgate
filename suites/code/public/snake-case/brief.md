# Convert identifiers to snake_case

Write `toSnakeCase(name)`. It converts an identifier written in camelCase, PascalCase, kebab-case or with
spaces into lowercase words joined by single underscores.

## Rules

1. A word boundary is inserted (as `_`) **between a lowercase letter or a digit and a capital letter**:
   `userName` is `user_name`, `version2Beta` is `version2_beta`.
2. A boundary is also inserted **inside a run of capitals, before the last capital when a lowercase
   letter follows it**: `HTTPServer` is `http_server`, `parseXMLFile` is `parse_xml_file`. A run of capitals
   with no lowercase letter after it stays together: `userID` is `user_id`, `ID` is `id`.
3. Every run of one or more spaces, tabs or hyphens becomes a single `_`.
4. The result is entirely lowercase.
5. Runs of `_` (from the input or produced by the rules) collapse into a single `_`, including at the very
   start and the very end. So `__init__` becomes `_init_`, and `_privateVar` becomes `_private_var`.
6. Digits are not boundaries on their own: `get2ndItem` is `get2nd_item`.

## Errors

If `name` is not a string, throw a `TypeError`. An empty string gives an empty string.

## Examples

```
toSnakeCase("camelCase")           // "camel_case"
toSnakeCase("getHTTPResponseCode") // "get_http_response_code"
toSnakeCase("my-var name")         // "my_var_name"
toSnakeCase("__init__")            // "_init_"
```

## Output

Write the file `solution.mjs`. It must export `toSnakeCase`.
