import { describe, expect, it } from 'vitest';
import { themeCookieMirror } from '#lib/theme/theme-cookie-mirror.ts';

class RecordingCookies {
  readonly written = new Map<string, string>();
  private readonly values: Map<string, string>;

  constructor(values: Record<string, string>) {
    this.values = new Map(Object.entries(values));
  }

  readonly get = (name: string): string | undefined => this.values.get(name);
  readonly set = (name: string, value: string): void => {
    this.written.set(name, value);
  };
}

describe('ThemeCookieMirror', () => {
  it('keeps the request’s preference for a signed-out visitor', () => {
    const cookies = new RecordingCookies({});

    expect(
      themeCookieMirror.adopt({
        cookies,
        requested: { theme: 'characters', mode: 'dark' },
        saved: null,
      }),
    ).toEqual({ theme: 'characters', mode: 'dark' });
    expect(cookies.written.size).toBe(0);
  });

  it('keeps the requested mode while the viewer hasn’t picked one', () => {
    const cookies = new RecordingCookies({ 'dash-theme': 'characters' });

    expect(
      themeCookieMirror.adopt({
        cookies,
        requested: { theme: 'characters', mode: 'dark' },
        saved: { theme: 'characters', colorMode: null },
      }),
    ).toEqual({ theme: 'characters', mode: 'dark' });
    expect(cookies.written.size).toBe(0);
  });

  it('rewrites only the cookies that disagree with the saved preference', () => {
    const cookies = new RecordingCookies({
      'dash-theme': 'characters',
      'dash-mode': 'dark',
    });

    expect(
      themeCookieMirror.adopt({
        cookies,
        requested: { theme: 'characters', mode: 'dark' },
        saved: { theme: 'characters', colorMode: 'light' },
      }),
    ).toEqual({ theme: 'characters', mode: 'light' });
    expect(cookies.written).toEqual(new Map([['dash-mode', 'light']]));
  });
});
