import { defineConfig, devices } from '@playwright/test';

const shellPort = 4319;
const passkeyPort = 4320;
const stubPort = 59998;
const serviceAccountsPort = 4321;
const serviceAccountsStubPort = 59997;
const serviceAccountsWebUrl = `http://localhost:${serviceAccountsPort}`;
const serviceAccountsStubUrl = `http://localhost:${serviceAccountsStubPort}`;
const accountMenuPort = 4322;
const accountMenuStubPort = 59996;
const accountMenuWebUrl = `http://localhost:${accountMenuPort}`;
const accountMenuStubUrl = `http://localhost:${accountMenuStubPort}`;
const passkeyWebUrl = `http://localhost:${passkeyPort}`;
const liveMissionControl = process.env['DASH_E2E_API_BASE_URL'];
const passkeyApiBaseUrl = liveMissionControl ?? `http://localhost:${stubPort}`;
const setupToken = process.env['DASH_E2E_SETUP_TOKEN'] ?? 'stub-setup-token';

export default defineConfig({
  testDir: 'src',
  testMatch: '**/__tests__/*.e2e.test.ts',
  forbidOnly: Boolean(process.env['CI']),
  reporter: process.env['CI'] ? 'github' : 'list',
  projects: [
    {
      name: 'chromium',
      testIgnore: [
        '**/passkeys.e2e.test.ts',
        '**/service-accounts.e2e.test.ts',
        '**/account-menu.e2e.test.ts',
      ],
      use: {
        ...devices['Desktop Chrome'],
        baseURL: `http://127.0.0.1:${shellPort}`,
      },
    },
    {
      name: 'passkeys',
      testMatch: '**/passkeys.e2e.test.ts',
      metadata: {
        missionControlUrl: passkeyApiBaseUrl,
        setupToken,
        live: liveMissionControl !== undefined,
      },
      use: { ...devices['Desktop Chrome'], baseURL: passkeyWebUrl },
    },
    {
      name: 'service-accounts',
      testMatch: '**/service-accounts.e2e.test.ts',
      metadata: { missionControlUrl: serviceAccountsStubUrl },
      use: { ...devices['Desktop Chrome'], baseURL: serviceAccountsWebUrl },
    },
    {
      name: 'account-menu',
      testMatch: '**/account-menu.e2e.test.ts',
      metadata: { missionControlUrl: accountMenuStubUrl },
      use: { ...devices['Desktop Chrome'], baseURL: accountMenuWebUrl },
    },
  ],
  webServer: [
    {
      command: 'node build',
      url: `http://127.0.0.1:${shellPort}`,
      reuseExistingServer: false,
      env: {
        HOST: '127.0.0.1',
        PORT: String(shellPort),
        API_BASE_URL: 'http://127.0.0.1:59999',
      },
    },
    {
      command: 'node build',
      url: passkeyWebUrl,
      reuseExistingServer: false,
      env: {
        HOST: 'localhost',
        PORT: String(passkeyPort),
        API_BASE_URL: passkeyApiBaseUrl,
      },
    },
    {
      command: 'node build',
      url: serviceAccountsWebUrl,
      reuseExistingServer: false,
      env: {
        HOST: 'localhost',
        PORT: String(serviceAccountsPort),
        API_BASE_URL: serviceAccountsStubUrl,
      },
    },
    {
      command: `node src/routes/__tests__/support/serve-mission-control-stub.ts ${serviceAccountsStubPort} ${serviceAccountsWebUrl}`,
      url: `${serviceAccountsStubUrl}/api/auth/setup/status`,
      reuseExistingServer: false,
    },
    {
      command: 'node build',
      url: accountMenuWebUrl,
      reuseExistingServer: false,
      env: {
        HOST: 'localhost',
        PORT: String(accountMenuPort),
        API_BASE_URL: accountMenuStubUrl,
        APP_VERSION: 'v1.1.1',
        APP_COMMIT: '7615036f0c2b9a8e1d4f5a6b7c8d9e0f1a2b3c4d',
      },
    },
    {
      command: `node src/routes/__tests__/support/serve-mission-control-stub.ts ${accountMenuStubPort} ${accountMenuWebUrl}`,
      url: `${accountMenuStubUrl}/api/auth/setup/status`,
      reuseExistingServer: false,
    },
    ...(liveMissionControl === undefined
      ? [
          {
            command: `node src/routes/__tests__/support/serve-mission-control-stub.ts ${stubPort} ${passkeyWebUrl}`,
            url: `http://localhost:${stubPort}/api/auth/setup/status`,
            reuseExistingServer: false,
          },
        ]
      : []),
  ],
});
