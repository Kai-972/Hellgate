// Finding the code in a model's reply: the contents of the first fenced block, or the whole reply.

export function extractCode(reply: string): string {
  const fenced = /```[a-zA-Z]*\n([\s\S]*?)```/.exec(reply);
  const code = (fenced === null ? reply : fenced[1]!).trim();
  return code === '' ? '' : `${code}\n`;
}
