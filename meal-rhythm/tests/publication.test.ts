import { it, expect } from 'vitest';
import { readFile } from 'node:fs/promises';

it('published workflow executes the app subdirectory and retains the bootcamp README', async () => {
  const workflow = await readFile('../.github/workflows/meal-rhythm.yml', 'utf8');
  expect(workflow).toContain('working-directory: meal-rhythm');
  expect(workflow.match(/cache-dependency-path: meal-rhythm\/package-lock.json/g)).toHaveLength(2);
  for (const required of ['npm run verify', 'npx prisma migrate deploy', 'docker build', 'xcodebuild test', 'TEST_REDIS_URL', 'TEST_DATABASE_URL']) {
    expect(workflow).toContain(required);
  }
  expect(await readFile('../README.md', 'utf8')).toContain('AI Agent Bootcamp');
});
