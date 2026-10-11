// A correct solution, used to prove the task's cases are fair. Never shown to an agent.
export function wrapText(text, width) {
  if (typeof text !== 'string') throw new TypeError('text must be a string');
  if (!Number.isInteger(width) || width < 1) throw new RangeError('width must be an integer of at least 1');
  const lines = [];
  let current = '';
  for (let word of text.split(/\s+/).filter(Boolean)) {
    if (word.length > width) {
      if (current !== '') { lines.push(current); current = ''; }
      while (word.length > width) { lines.push(word.slice(0, width)); word = word.slice(width); }
      current = word;
    } else if (current === '') current = word;
    else if (current.length + 1 + word.length <= width) current += ' ' + word;
    else { lines.push(current); current = word; }
  }
  if (current !== '') lines.push(current);
  return lines;
}
