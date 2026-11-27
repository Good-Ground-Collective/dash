import config from '@dash/config/eslint';

export default [
  { ignores: ['apps/**', 'packages/**', 'integrations/**'] },
  ...config,
];
