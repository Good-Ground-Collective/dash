import { describe, expect, it } from 'vitest';
import { themePreferenceReader } from '#lib/theme/theme-preference-reader.ts';

describe('ThemePreferenceReader', () => {
  it('uses the cookies when they hold known values', () => {
    expect(
      themePreferenceReader.read({
        themeCookie: 'characters',
        modeCookie: 'dark',
        colorSchemeHint: 'light',
      }),
    ).toEqual({ theme: 'characters', mode: 'dark' });
  });

  it('falls back to the colour-scheme client hint when there is no mode cookie', () => {
    expect(
      themePreferenceReader.read({
        themeCookie: undefined,
        modeCookie: undefined,
        colorSchemeHint: 'dark',
      }),
    ).toEqual({ theme: 'characters', mode: 'dark' });
  });

  it('defaults to Characters in light mode for unknown or missing values', () => {
    expect(
      themePreferenceReader.read({
        themeCookie: 'neon',
        modeCookie: 'sepia',
        colorSchemeHint: null,
      }),
    ).toEqual({ theme: 'characters', mode: 'light' });
  });
});
