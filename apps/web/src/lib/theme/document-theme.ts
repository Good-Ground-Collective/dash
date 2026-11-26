import type { ThemePreference } from '#lib/theme/theme-preference-reader.ts';

/** Writes the theme and mode into the rendered `<html>` element. */
export interface DocumentTheme {
  apply(props: { html: string; preference: ThemePreference }): string;
}

/** Fills the `%dash.theme%` and `%dash.mode%` placeholders in `app.html`. */
export class PlaceholderDocumentTheme implements DocumentTheme {
  apply(props: { html: string; preference: ThemePreference }): string {
    return props.html
      .replace(
        PlaceholderDocumentTheme.THEME_PLACEHOLDER,
        props.preference.theme,
      )
      .replace(
        PlaceholderDocumentTheme.MODE_PLACEHOLDER,
        props.preference.mode,
      );
  }

  static readonly THEME_PLACEHOLDER = '%dash.theme%';
  static readonly MODE_PLACEHOLDER = '%dash.mode%';
}

export const documentTheme: DocumentTheme = new PlaceholderDocumentTheme();
