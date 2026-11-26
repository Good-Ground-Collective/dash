import { describe, expect, it } from 'vitest';
import { documentTheme } from '#lib/theme/document-theme.ts';

describe('DocumentTheme', () => {
  it('fills the theme and mode placeholders on the html element', () => {
    const html =
      '<html lang="en" data-theme="%dash.theme%" data-mode="%dash.mode%">';
    expect(
      documentTheme.apply({
        html,
        preference: { theme: 'characters', mode: 'dark' },
      }),
    ).toBe('<html lang="en" data-theme="characters" data-mode="dark">');
  });

  it('leaves chunks without placeholders alone', () => {
    const html = '<main>%dash.theme is not a placeholder</main>';
    expect(
      documentTheme.apply({
        html,
        preference: { theme: 'characters', mode: 'light' },
      }),
    ).toBe(html);
  });
});
