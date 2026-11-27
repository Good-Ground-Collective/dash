import type { Cookies } from '@sveltejs/kit';
import {
  type ColorMode,
  CookieThemePreferenceReader,
  type ThemeName,
  type ThemePreference,
} from '#lib/theme/theme-preference-reader.ts';

/** What Mission Control has saved for the viewer. `colorMode` is `null` until they pick one. */
export interface SavedAppearance {
  theme: ThemeName;
  colorMode: ColorMode | null;
}

/** Keeps the theme cookies in step with the preference saved on the server. */
export interface ThemeCookieMirror {
  /** The saved preference wins over the request's; cookies that disagree with it are rewritten. */
  adopt(props: {
    cookies: Pick<Cookies, 'get' | 'set'>;
    requested: ThemePreference;
    saved: SavedAppearance | null;
  }): ThemePreference;
}

/** Writes the cookies `CookieThemePreferenceReader` reads, server-side and HttpOnly: only SvelteKit reads them. */
export class ServerThemeCookieMirror implements ThemeCookieMirror {
  adopt(props: {
    cookies: Pick<Cookies, 'get' | 'set'>;
    requested: ThemePreference;
    saved: SavedAppearance | null;
  }): ThemePreference {
    if (props.saved === null) return props.requested;

    const preference: ThemePreference = {
      theme: props.saved.theme,
      mode: props.saved.colorMode ?? props.requested.mode,
    };
    this.write({
      cookies: props.cookies,
      name: CookieThemePreferenceReader.THEME_COOKIE,
      value: preference.theme,
    });
    if (props.saved.colorMode !== null) {
      this.write({
        cookies: props.cookies,
        name: CookieThemePreferenceReader.MODE_COOKIE,
        value: props.saved.colorMode,
      });
    }
    return preference;
  }

  private write(props: {
    cookies: Pick<Cookies, 'get' | 'set'>;
    name: string;
    value: string;
  }): void {
    if (props.cookies.get(props.name) === props.value) return;
    props.cookies.set(props.name, props.value, {
      path: '/',
      maxAge: ServerThemeCookieMirror.MAX_AGE_SECONDS,
      sameSite: 'lax',
      httpOnly: true,
    });
  }

  /** Browsers cap cookie lifetimes at 400 days. */
  static readonly MAX_AGE_SECONDS = 400 * 24 * 60 * 60;
}

export const themeCookieMirror: ThemeCookieMirror =
  new ServerThemeCookieMirror();
