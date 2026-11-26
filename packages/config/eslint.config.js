import preflight from '@good-ground-collective/preflight';

export default [
  { ignores: ['**/dist/**', '**/coverage/**', '**/.svelte-kit/**'] },
  ...preflight.configs.recommended,
  ...preflight.configs.layout,
  {
    files: ['**/*.ts', '**/*.tsx'],
    rules: {
      'preflight/module-layout': ['error', preflight.layouts.module],
    },
  },
  {
    files: ['*.config.ts'],
    rules: {
      'import-x/no-default-export': 'off',
    },
  },
];
