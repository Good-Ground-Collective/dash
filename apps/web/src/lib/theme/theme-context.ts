import { createContext } from 'svelte';
import type { ThemePreference } from '#lib/theme/theme-preference-reader.ts';

/** The theme and mode the page is showing, for the variants CSS can't express. Read `current` inside a reactive scope. */
export interface ThemeContext {
  readonly current: ThemePreference;
  /** Shows `preference` straight away, before Mission Control has saved it. */
  preview(preference: ThemePreference): void;
  /** Drops the preview and goes back to the saved preference. */
  settle(): void;
}

export const [getThemeContext, setThemeContext] = createContext<ThemeContext>();
