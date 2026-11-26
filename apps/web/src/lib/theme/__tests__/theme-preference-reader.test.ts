import { describe, expect, it } from 'vitest';
import { themePreferenceReader } from '#lib/theme/theme-preference-reader.ts';

class FakeRequest {
  readonly headers: Headers;
  readonly cookies = { get: (name: string) => this.values.get(name) };
  private readonly values: Map<string, string>;

  constructor(props: { cookies: Record<string, string>; hint?: string }) {
    this.values = new Map(Object.entries(props.cookies));
    this.headers = new Headers(
      props.hint === undefined
        ? {}
        : { 'sec-ch-prefers-color-scheme': props.hint },
    );
  }
}

describe('ThemePreferenceReader', () => {
  it('uses the cookies when they hold known values', () => {
    const request = new FakeRequest({
      cookies: { 'dash-theme': 'characters', 'dash-mode': 'dark' },
      hint: 'light',
    });
    expect(themePreferenceReader.read(request)).toEqual({
      theme: 'characters',
      mode: 'dark',
    });
  });

  it('falls back to the colour-scheme client hint when there is no mode cookie', () => {
    const request = new FakeRequest({ cookies: {}, hint: 'dark' });
    expect(themePreferenceReader.read(request)).toEqual({
      theme: 'characters',
      mode: 'dark',
    });
  });

  it('reads the client hint in its quoted structured-field form', () => {
    const request = new FakeRequest({ cookies: {}, hint: '"dark"' });
    expect(themePreferenceReader.read(request)).toEqual({
      theme: 'characters',
      mode: 'dark',
    });
  });

  it('defaults to Characters in light mode for unknown or missing values', () => {
    const request = new FakeRequest({
      cookies: { 'dash-theme': 'neon', 'dash-mode': 'sepia' },
    });
    expect(themePreferenceReader.read(request)).toEqual({
      theme: 'characters',
      mode: 'light',
    });
  });
});
