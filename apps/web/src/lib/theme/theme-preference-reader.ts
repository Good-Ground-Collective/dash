import { z } from 'zod';

export const themeNameSchema = z.enum(['characters']);
export const colorModeSchema = z.enum(['light', 'dark']);

export type ThemeName = z.infer<typeof themeNameSchema>;
export type ColorMode = z.infer<typeof colorModeSchema>;

export interface ThemePreference {
  theme: ThemeName;
  mode: ColorMode;
}

/** Reads the theme and mode a request asks for, falling back to Characters in light mode. */
export class ThemePreferenceReader {
  read(props: {
    themeCookie: string | undefined;
    modeCookie: string | undefined;
    colorSchemeHint: string | null;
  }): ThemePreference {
    const theme = themeNameSchema.safeParse(props.themeCookie);
    const mode = colorModeSchema.safeParse(props.modeCookie);
    const hinted = colorModeSchema.safeParse(props.colorSchemeHint);
    return {
      theme: theme.success ? theme.data : 'characters',
      mode: mode.success ? mode.data : hinted.success ? hinted.data : 'light',
    };
  }

  static readonly THEME_COOKIE = 'dash-theme';
  static readonly MODE_COOKIE = 'dash-mode';
  static readonly COLOR_SCHEME_HINT = 'sec-ch-prefers-color-scheme';
}

export const themePreferenceReader = new ThemePreferenceReader();
