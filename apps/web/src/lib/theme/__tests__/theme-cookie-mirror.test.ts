import { describe, expect, it } from 'vitest';
import { themeCookieMirror } from '#lib/theme/theme-cookie-mirror.ts';
import { RecordingCookies } from '#lib/theme/__tests__/support/recording-cookies.ts';

describe('ThemeCookieMirror', () => {
  it('keeps the request’s preference for a signed-out visitor', () => {
    const cookies = new RecordingCookies();

    expect(
      themeCookieMirror.resolve({
        cookies,
        requested: { theme: 'characters', mode: 'dark' },
        saved: null,
      }),
    ).toEqual({ theme: 'characters', mode: 'dark' });
    expect(cookies.written.size).toBe(0);
  });

  it('keeps the requested mode while the viewer hasn’t picked one', () => {
    const cookies = new RecordingCookies({
      values: { 'dash-theme': 'characters' },
    });

    expect(
      themeCookieMirror.resolve({
        cookies,
        requested: { theme: 'characters', mode: 'dark' },
        saved: { theme: 'characters', colorMode: null },
      }),
    ).toEqual({ theme: 'characters', mode: 'dark' });
    expect(cookies.written.size).toBe(0);
  });

  it('rewrites only the cookies that disagree with the saved preference', () => {
    const cookies = new RecordingCookies({
      values: {
        'dash-theme': 'characters',
        'dash-mode': 'dark',
      },
    });

    expect(
      themeCookieMirror.resolve({
        cookies,
        requested: { theme: 'characters', mode: 'dark' },
        saved: { theme: 'characters', colorMode: 'light' },
      }),
    ).toEqual({ theme: 'characters', mode: 'light' });
    expect(cookies.written).toEqual(new Map([['dash-mode', 'light']]));
  });
});
