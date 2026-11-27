import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    passWithNoTests: true,
    provide: {
      databaseUrl: process.env['DASH_TEST_DATABASE_URL'] ?? null,
    },
  },
});

declare module 'vitest' {
  export interface ProvidedContext {
    /** A disposable Postgres that repository tests migrate and write to. They skip without it. */
    databaseUrl: string | null;
  }
}
