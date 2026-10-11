// A correct solution, used to prove the task's cases are fair. Never shown to an agent.
export function parseCsvLine(line) {
  if (typeof line !== 'string') throw new TypeError('line must be a string');
  const fields = [];
  let i = 0;
  for (;;) {
    let field = '';
    if (line[i] === '"') {
      i++;
      for (;;) {
        if (i >= line.length) throw new RangeError('unterminated quote');
        if (line[i] === '"') {
          if (line[i + 1] === '"') { field += '"'; i += 2; continue; }
          i++;
          break;
        }
        field += line[i++];
      }
      if (i < line.length && line[i] !== ',') throw new RangeError('text after a closing quote');
    } else {
      while (i < line.length && line[i] !== ',') {
        if (line[i] === '"') throw new RangeError('quote in an unquoted field');
        field += line[i++];
      }
    }
    fields.push(field);
    if (i >= line.length) return fields;
    i++; // the comma
  }
}
