import { z } from 'zod';

export const themeNameSchema = z.enum(['characters']);
export const colorModeSchema = z.enum(['light', 'dark']);

export type ThemeName = z.infer<typeof themeNameSchema>;
export type ColorMode = z.infer<typeof colorModeSchema>;

export interface ThemePreference {
  theme: ThemeName;
  mode: ColorMode;
}

export interface ThemePreferenceSources {
  themeCookie: string | undefined;
  modeCookie: string | undefined;
  colorSchemeHint: string | null;
}

/** Works out which theme and mode a request should render in. */
export interface ThemePreferenceReader {
  read(sources: ThemePreferenceSources): ThemePreference;
}

/** Reads the theme and mode cookies, then the colour-scheme client hint, then falls back to Characters in light mode. */
export class CookieThemePreferenceReader implements ThemePreferenceReader {
  read(sources: ThemePreferenceSources): ThemePreference {
    const theme = themeNameSchema.safeParse(sources.themeCookie);
    const mode = colorModeSchema.safeParse(sources.modeCookie);
    const hinted = colorModeSchema.safeParse(sources.colorSchemeHint);

    return {
      theme: theme.success ? theme.data : 'characters',
      mode: mode.success ? mode.data : hinted.success ? hinted.data : 'light',
    };
  }

  static readonly THEME_COOKIE = 'dash-theme';
  static readonly MODE_COOKIE = 'dash-mode';
  static readonly COLOR_SCHEME_HINT = 'sec-ch-prefers-color-scheme';
}

export const themePreferenceReader: ThemePreferenceReader =
  new CookieThemePreferenceReader();
