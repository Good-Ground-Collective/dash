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
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              regex: '^@dash/integrations-(?!core$)',
              message:
                "Only Mission Control's src/integrations/module.ts may import a provider package. Depend on @dash/integrations-core and ask an integration for a capability instead.",
            },
          ],
        },
      ],
    },
  },
  {
    files: ['*.config.ts'],
    rules: {
      'import-x/no-default-export': 'off',
    },
  },
];
