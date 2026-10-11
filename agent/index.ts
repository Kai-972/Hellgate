// The agent: one model call per task, then write the solution file it returns. It tells the model what
// the task is called, the sentence that introduces it, and which file to write. It leaves out the rules,
// the examples and the error cases.
import type { Answer, Kit, TaskBrief } from './contract.ts';
import { extractCode } from './extract.ts';
import { RULES } from './instructions.ts';

/** The paragraphs of the brief that are not headings. */
const paragraphs = (brief: string): string[] => brief.split(/\n\s*\n/).map((p) => p.trim()).filter((p) => p !== '' && !p.startsWith('#'));

export async function solve(task: TaskBrief, kit: Kit): Promise<Answer> {
  const reply = await kit.model.generate({
    tag: 'draft',
    system: RULES.join('\n'),
    messages: [{ role: 'user', text: `${task.title}\n\n${paragraphs(task.brief)[0] ?? ''}\n\n${paragraphs(task.brief).at(-1) ?? ''}` }],
    maxOutputTokens: 2000,
    temperature: 0.3,
  });
  return { files: [{ path: task.entry, contents: extractCode(reply.text) }] };
}
