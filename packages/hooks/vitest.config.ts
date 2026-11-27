import { defineConfig } from 'vitest/config';

export default defineConfig({
  ssr: {
    resolve: {
      conditions: [
        '@good-ground-collective/dash-hooks-source',
        'module',
        'node',
        'development|production',
      ],
    },
  },
  test: {
    passWithNoTests: true,
  },
});
