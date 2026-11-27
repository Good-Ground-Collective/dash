import { describe, expect, it } from 'vitest';
import { reportedCharacterHueSchema } from '#lib/theme/character-hue.ts';

describe('reportedCharacterHueSchema', () => {
  it('keeps a hue it knows', () => {
    expect(reportedCharacterHueSchema.parse('teal')).toBe('teal');
  });

  it.each([undefined, 'chartreuse', '#ff0000'])(
    'reads %s as neutral',
    (value) => {
      expect(reportedCharacterHueSchema.parse(value)).toBe('neutral');
    },
  );
});
