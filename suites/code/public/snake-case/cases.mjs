// Hidden test cases. The agent never sees this file.
export default [
  { name: 'camel and pascal case', run: (m, a) => { a.equal(m.toSnakeCase('camelCase'), 'camel_case'); a.equal(m.toSnakeCase('PascalCase'), 'pascal_case'); a.equal(m.toSnakeCase('aB'), 'a_b'); a.equal(m.toSnakeCase('A'), 'a'); } },
  { name: 'acronyms stay together', run: (m, a) => { a.equal(m.toSnakeCase('userID'), 'user_id'); a.equal(m.toSnakeCase('ID'), 'id'); a.equal(m.toSnakeCase('HTML'), 'html'); } },
  { name: 'an acronym before a word is split before its last capital', run: (m, a) => { a.equal(m.toSnakeCase('HTTPServer'), 'http_server'); a.equal(m.toSnakeCase('parseXMLFile'), 'parse_xml_file'); a.equal(m.toSnakeCase('getHTTPResponseCode'), 'get_http_response_code'); } },
  { name: 'digits', run: (m, a) => { a.equal(m.toSnakeCase('version2Beta'), 'version2_beta'); a.equal(m.toSnakeCase('get2ndItem'), 'get2nd_item'); a.equal(m.toSnakeCase('x1Y2'), 'x1_y2'); } },
  { name: 'spaces, tabs and hyphens', run: (m, a) => { a.equal(m.toSnakeCase('my-var name'), 'my_var_name'); a.equal(m.toSnakeCase('a  b\tc'), 'a_b_c'); a.equal(m.toSnakeCase('Hello World-Wide'), 'hello_world_wide'); } },
  { name: 'existing underscores collapse', run: (m, a) => { a.equal(m.toSnakeCase('already_snake'), 'already_snake'); a.equal(m.toSnakeCase('a__b___c'), 'a_b_c'); a.equal(m.toSnakeCase('a_ b'), 'a_b'); } },
  { name: 'leading and trailing underscores are kept as one', run: (m, a) => { a.equal(m.toSnakeCase('__init__'), '_init_'); a.equal(m.toSnakeCase('_privateVar'), '_private_var'); a.equal(m.toSnakeCase('trailing_'), 'trailing_'); } },
  { name: 'an underscore before a capital adds nothing', run: (m, a) => { a.equal(m.toSnakeCase('snake_Case'), 'snake_case'); a.equal(m.toSnakeCase('_Private'), '_private'); } },
  { name: 'already lowercase words are unchanged', run: (m, a) => { a.equal(m.toSnakeCase('plain'), 'plain'); a.equal(m.toSnakeCase(''), ''); } },
  { name: 'rejects non-strings', run: (m, a) => { a.equal(typeof m.toSnakeCase, 'function'); for (const v of [undefined, null, 5, []]) a.throws(() => m.toSnakeCase(v), TypeError); } },
];
