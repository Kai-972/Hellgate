// A correct solution, used to prove the task's cases are fair. Never shown to an agent.
export function toSnakeCase(name) {
  if (typeof name !== 'string') throw new TypeError('name must be a string');
  return name
    .replace(/[\s-]+/g, '_')
    .replace(/([a-z0-9])([A-Z])/g, '$1_$2')
    .replace(/([A-Z]+)([A-Z][a-z])/g, '$1_$2')
    .toLowerCase()
    .replace(/_+/g, '_');
}
