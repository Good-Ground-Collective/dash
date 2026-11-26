import { defineConfig, devices } from '@playwright/test';

const port = 4319;

export default defineConfig({
  testDir: 'src',
  testMatch: '**/__tests__/*.e2e.test.ts',
  forbidOnly: Boolean(process.env['CI']),
  reporter: process.env['CI'] ? 'github' : 'list',
  use: {
    baseURL: `http://127.0.0.1:${port}`,
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: {
    command: 'node build',
    url: `http://127.0.0.1:${port}`,
    reuseExistingServer: false,
    env: {
      HOST: '127.0.0.1',
      PORT: String(port),
      API_BASE_URL: 'http://127.0.0.1:59999',
    },
  },
});
