import { describe, expect, it } from 'vitest';
import { ChipTones } from '#lib/objectives/chip-tones.ts';

describe('ChipTones.forPriority', () => {
  it.each([
    ['P1', 'p1'],
    ['P2', 'p2'],
    ['P3', 'p3'],
  ])('maps %s to %s', (label, tone) => {
    expect(ChipTones.forPriority(label)).toBe(tone);
  });

  it('rejects a label that is not a priority', () => {
    expect(() => ChipTones.forPriority('P9')).toThrow();
  });
});
