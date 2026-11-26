import { z } from 'zod';

export const themeNameSchema = z.enum(['characters']);
export const colorModeSchema = z.enum(['light', 'dark']);

export type ThemeName = z.infer<typeof themeNameSchema>;
export type ColorMode = z.infer<typeof colorModeSchema>;

export interface ThemePreference {
  theme: ThemeName;
  mode: ColorMode;
}

/** The parts of a request a theme preference can come from. */
export interface ThemePreferenceRequest {
  cookies: { get: (name: string) => string | undefined };
  headers: Headers;
}

/** Works out which theme and mode a request should render in. */
export interface ThemePreferenceReader {
  /** The client hint the reader uses, for the response to ask browsers for. */
  readonly clientHint: string;
  read(request: ThemePreferenceRequest): ThemePreference;
}

/** Reads the theme and mode cookies, then the colour-scheme client hint, then falls back to Characters in light mode. */
export class CookieThemePreferenceReader implements ThemePreferenceReader {
  readonly clientHint = 'sec-ch-prefers-color-scheme';

  read(request: ThemePreferenceRequest): ThemePreference {
    const theme = themeNameSchema
      .catch('characters')
      .parse(request.cookies.get(CookieThemePreferenceReader.THEME_COOKIE));
    const hintedMode = colorModeSchema
      .catch('light')
      .parse(request.headers.get(this.clientHint)?.replaceAll('"', ''));
    const mode = colorModeSchema
      .catch(hintedMode)
      .parse(request.cookies.get(CookieThemePreferenceReader.MODE_COOKIE));

    return { theme, mode };
  }

  static readonly THEME_COOKIE = 'dash-theme';
  static readonly MODE_COOKIE = 'dash-mode';
}

export const themePreferenceReader: ThemePreferenceReader =
  new CookieThemePreferenceReader();
