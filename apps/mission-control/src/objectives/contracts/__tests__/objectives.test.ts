import { describe, expect, it } from 'vitest';
import { epicTasksSchema } from '#src/objectives/contracts/objectives.ts';

const task = {
  id: 'I_1',
  title: 'Hash recovery codes',
  url: 'https://github.com/acme/app/issues/1',
  state: 'open',
  assignees: [],
};

describe('epicTasksSchema', () => {
  it('carries every task URL beside the capped list', () => {
    const tasks = epicTasksSchema.parse({
      items: [task],
      total: 2,
      urls: [
        'https://github.com/acme/app/issues/1',
        'https://github.com/acme/app/issues/2',
      ],
    });

    expect(tasks.urls).toHaveLength(2);
  });

  it('refuses a task list without its URLs', () => {
    expect(epicTasksSchema.safeParse({ items: [task], total: 1 }).success).toBe(
      false,
    );
  });

  it('refuses a URL that is not one', () => {
    expect(
      epicTasksSchema.safeParse({ items: [], total: 1, urls: ['issue 1'] })
        .success,
    ).toBe(false);
  });
});
