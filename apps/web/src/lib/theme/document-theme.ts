import type { ThemePreference } from '#lib/theme/theme-preference-reader.ts';

/** Writes the theme and mode into the `<html>` attributes of `app.html` while the page renders. */
export class DocumentTheme {
  apply(props: { html: string; preference: ThemePreference }): string {
    return props.html
      .replace(DocumentTheme.THEME_PLACEHOLDER, props.preference.theme)
      .replace(DocumentTheme.MODE_PLACEHOLDER, props.preference.mode);
  }

  static readonly THEME_PLACEHOLDER = '%dash.theme%';
  static readonly MODE_PLACEHOLDER = '%dash.mode%';
}

export const documentTheme = new DocumentTheme();
