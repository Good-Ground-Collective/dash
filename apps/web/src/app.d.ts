import type { ThemePreference } from '#lib/theme/theme-preference-reader.ts';

declare global {
  namespace App {
    interface Locals {
      hasSessionCookie: boolean;
      themePreference: ThemePreference;
    }
  }
}

export {};
