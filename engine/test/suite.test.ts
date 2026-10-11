import { loadTasks, makeSuiteIdFromTasks } from '../src/suite/index.js';
import { join } from 'path';

describe('suite', () => {
  it('loads public tasks', () => {
    const tasks = loadTasks(join(process.cwd(), '..', 'suites'));
    expect(Object.keys(tasks).length).toBeGreaterThanOrEqual(0);
  });

  it('makes suite id', () => {
    const id = makeSuiteIdFromTasks(join(process.cwd(), '..', 'suites'));
    expect(id).toHaveLength(64);
  });
});
