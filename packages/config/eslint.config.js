import preflight from '@good-ground-collective/preflight';

const providerBoundaryMessage =
  "Only Mission Control's src/integrations/module.ts may import a provider package. Depend on @dash/integrations-core and ask an integration for a capability instead.";

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
  // The provider import boundary. Flat config replaces a rule's options rather than merging
  // them, so a package that configures either rule for itself must re-include these entries.
  {
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              regex: '^@dash/integrations-(?!core$)',
              message: providerBoundaryMessage,
            },
          ],
        },
      ],
      // no-restricted-imports sees only static imports and exports.
      'no-restricted-syntax': [
        'error',
        {
          selector:
            'ImportExpression[source.value=/^@dash\\/integrations-(?!core$)/]',
          message: providerBoundaryMessage,
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
