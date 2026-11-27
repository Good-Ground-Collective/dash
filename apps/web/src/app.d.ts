import type { ThemePreference } from '#lib/theme/theme-preference-reader.ts';

declare global {
  namespace App {
    interface Locals {
      hasSessionCookie: boolean;
      /** What the page renders in. The root layout replaces the request's preference with the viewer's saved one. */
      themePreference: ThemePreference;
    }
  }
}

export {};
