import { describe, expect, it } from 'vitest';
import { ZodError } from 'zod';

import { Capability } from '#src/definitions/capabilities/capability.ts';

describe('Capability', () => {
  it('keeps a slug name', () => {
    expect(new Capability<object>({ name: 'task-tracker' }).name).toBe(
      'task-tracker',
    );
  });

  it.each([
    ['an empty name', ''],
    ['a mis-cased name', 'Task-Tracker'],
  ])('rejects %s', (_label, name) => {
    expect(() => new Capability<object>({ name })).toThrow(ZodError);
  });
});
