import { describe, expect, it } from 'vitest';

import { workItemSchema } from '#src/contracts/work-item.ts';

const base = {
  provider: 'github',
  externalId: 'I_kwDOAbc123',
  url: 'https://github.com/acme/app/issues/1',
  title: 'Ship onboarding',
  state: 'open',
  priority: 'P1',
  dueDate: '2026-12-31',
  lastActivityAt: '2026-11-20T09:30:00Z',
  position: 0,
};

describe('workItemSchema', () => {
  it('parses an initiative, an epic and a ticket by level', () => {
    expect(workItemSchema.parse({ ...base, level: 'initiative' }).level).toBe(
      'initiative',
    );
    expect(
      workItemSchema.parse({
        ...base,
        level: 'epic',
        initiativeIds: ['PVT_1'],
      }),
    ).toMatchObject({ level: 'epic', initiativeIds: ['PVT_1'] });
    expect(
      workItemSchema.parse({ ...base, level: 'ticket', epicId: 'I_epic' }),
    ).toMatchObject({ level: 'ticket', epicId: 'I_epic', position: 0 });
  });

  it('accepts a missing priority and due date as null', () => {
    const item = workItemSchema.parse({
      ...base,
      level: 'initiative',
      priority: null,
      dueDate: null,
    });
    expect(item).toMatchObject({ priority: null, dueDate: null });
  });

  it('accepts an epic outside any initiative', () => {
    expect(
      workItemSchema.safeParse({ ...base, level: 'epic', initiativeIds: [] })
        .success,
    ).toBe(true);
  });

  it('accepts a ticket outside any epic as a null epic', () => {
    expect(
      workItemSchema.parse({ ...base, level: 'ticket', epicId: null }),
    ).toMatchObject({ level: 'ticket', epicId: null });
  });

  it('rejects a ticket that omits its epic', () => {
    expect(workItemSchema.safeParse({ ...base, level: 'ticket' }).success).toBe(
      false,
    );
  });

  it.each([
    ['an unknown level', { level: 'story' }],
    ['a priority outside P1 to P3', { level: 'initiative', priority: 'P4' }],
    ['a state other than open or closed', { level: 'epic', state: 'parked' }],
    [
      'a due date with a time',
      { level: 'initiative', dueDate: '2026-12-31T00:00:00Z' },
    ],
    ['an empty external ID', { level: 'initiative', externalId: '' }],
    ['a URL that is not a URL', { level: 'initiative', url: 'acme/app#1' }],
    ['an uppercase provider', { level: 'initiative', provider: 'GitHub' }],
  ])('rejects %s', (_label, override) => {
    expect(
      workItemSchema.safeParse({ ...base, initiativeIds: [], ...override })
        .success,
    ).toBe(false);
  });
});
