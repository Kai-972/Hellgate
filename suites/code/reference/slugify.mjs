// A correct solution, used to prove the task's cases are fair. Never shown to an agent.
export function slugify(text, options) {
  if (typeof text !== 'string') throw new TypeError('text must be a string');
  let maxLength;
  if (options !== undefined && options !== null && options.maxLength !== undefined) {
    maxLength = options.maxLength;
    if (!Number.isInteger(maxLength) || maxLength < 1) throw new RangeError('maxLength must be a positive integer');
  }
  let slug = text
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  if (maxLength !== undefined && slug.length > maxLength) slug = slug.slice(0, maxLength).replace(/-+$/g, '');
  return slug;
}
