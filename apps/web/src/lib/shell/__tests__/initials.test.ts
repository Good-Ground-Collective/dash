import { describe, expect, it } from 'vitest';
import { Initials } from '#lib/shell/initials.ts';

describe('Initials', () => {
  it.each([
    ['Ada Lovelace', 'AL'],
    ['grace brewster murray hopper', 'GH'],
    ['  Linus  ', 'L'],
    ['𝒜da 𝒷yron', '𝒜𝒷'],
    ['', ''],
  ])('turns %j into %j', (name, initials) => {
    expect(Initials.of(name)).toBe(initials);
  });
});
