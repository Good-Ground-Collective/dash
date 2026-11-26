import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: 'src',
  testMatch: '**/__tests__/*.e2e.test.ts',
});
