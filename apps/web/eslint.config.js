import config from '@dash/config/eslint';

export default [
  { ignores: ['build/**'] },
  ...config,
  {
    files: ['**/*.e2e.test.ts'],
    rules: {
      'preflight/test-file-naming': ['error', { matchSource: 'off' }],
    },
  },
];
