import { readFileSync, readdirSync, statSync } from 'fs';
import { join } from 'path';
import { hashCanonical } from '../core/hash.js';

export function loadTasks(suitesDir: string): Record<string, any> {
  const publicDir = join(suitesDir, 'public');
  const tasks: Record<string, any> = {};
  try {
    const entries = readdirSync(publicDir);
    for (const entry of entries) {
      const taskPath = join(publicDir, entry);
      const stat = statSync(taskPath);
      if (stat.isDirectory()) {
        const taskJson = join(taskPath, 'task.json');
        try {
          const content = readFileSync(taskJson, 'utf8');
          const task = JSON.parse(content);
          tasks[entry] = task;
        } catch {
          // skip if missing
        }
      }
    }
  } catch {
    // empty
  }
  return tasks;
}

export function makeSuiteIdFromTasks(suitesDir: string): string {
  const tasks = loadTasks(suitesDir);
  return hashCanonical({ type: 'suite', tasks });
}
