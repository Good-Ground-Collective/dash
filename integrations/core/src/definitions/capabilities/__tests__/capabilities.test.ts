import { describe, expect, it } from 'vitest';

import * as capabilities from '#src/definitions/capabilities/capabilities.ts';

describe('capability keys', () => {
  it('gives every key its own name', () => {
    const names = Object.values(capabilities).map(({ name }) => name);
    expect(new Set(names).size).toBe(names.length);
  });
});
