import { describe, expect, it } from 'vitest';

import {
  characterHues,
  storedCharacterHueSchema,
} from '#src/auth/definitions/character-hues/character-hues.ts';

describe('RegisteredCharacterHues', () => {
  it('gives an identifier the same coloured hue every time', () => {
    const first = characterHues.forIdentifier('studio');

    expect(characterHues.forIdentifier('studio')).toBe(first);
    expect(first).not.toBe('neutral');
  });

  it('spreads identifiers across more than one hue', () => {
    const hues = new Set(
      ['studio', 'mbp', 'vps', 'beast', 'juno', 'moss', 'rook', 'wren'].map(
        (identifier) => characterHues.forIdentifier(identifier),
      ),
    );

    expect(hues.size).toBeGreaterThan(1);
  });

  it('reads a hue it no longer knows as neutral', () => {
    expect(storedCharacterHueSchema.parse('chartreuse')).toBe('neutral');
  });
});
