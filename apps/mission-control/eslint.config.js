import config from '@dash/config/eslint';

export default [
  ...config,
  {
    files: ['src/integrations/module.ts'],
    rules: {
      'no-restricted-imports': 'off',
      'no-restricted-syntax': 'off',
    },
  },
];
