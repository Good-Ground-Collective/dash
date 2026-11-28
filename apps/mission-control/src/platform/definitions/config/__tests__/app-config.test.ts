import { readFile } from 'node:fs/promises';
import { parseEnv } from 'node:util';

import { describe, expect, it } from 'vitest';

import {
  AppConfig,
  developmentAuthSecret,
} from '#src/platform/definitions/config/app-config.ts';
import { ConfigError } from '#src/platform/errors.ts';

const databaseUrl = 'postgres://dash:dash@127.0.0.1:54329/mission_control';
const githubAppEnv = {
  GITHUB_APP_ID: '5947367',
  GITHUB_APP_SLUG: 'good-ground-dash',
  GITHUB_APP_CLIENT_ID: 'Iv23-client',
  GITHUB_APP_CLIENT_SECRET: 'client-secret',
  GITHUB_APP_PRIVATE_KEY: 'pem',
  GITHUB_WEBHOOK_SECRET: 'webhook-secret',
};
const productionEnvWithoutGithub = {
  NODE_ENV: 'production',
  DATABASE_URL: databaseUrl,
  BETTER_AUTH_SECRET: 'production-secret-that-is-long-enough',
  BETTER_AUTH_URL: 'https://api.dash.doublel.studio',
};
const productionEnv = { ...productionEnvWithoutGithub, ...githubAppEnv };
const developmentEnv = {
  ...productionEnvWithoutGithub,
  NODE_ENV: 'development',
  BETTER_AUTH_URL: 'http://localhost:3000',
};

describe('AppConfig', () => {
  it('fails fast when a required variable is missing', () => {
    expect(() => new AppConfig({ NODE_ENV: 'production' })).toThrow(
      ConfigError,
    );
  });

  it('rejects a database URL that is not Postgres', () => {
    expect(
      () =>
        new AppConfig({
          ...productionEnv,
          DATABASE_URL: 'mysql://127.0.0.1/db',
        }),
    ).toThrow(ConfigError);
  });

  it('rejects a local web origin with a trailing slash', () => {
    expect(
      () =>
        new AppConfig({
          ...developmentEnv,
          DEV_WEB_ORIGIN: 'http://localhost:5173/',
        }),
    ).toThrow(ConfigError);
  });

  it('rejects a blank port instead of binding a random one', () => {
    expect(
      () =>
        new AppConfig({
          ...productionEnv,
          PORT: '',
        }),
    ).toThrow(ConfigError);
  });

  it('allows only the production web origin outside development', () => {
    const config = new AppConfig(productionEnv);

    expect(config.corsOrigins).toEqual(['https://dash.doublel.studio']);
    expect(config.port).toBe(3000);
  });
});

describe('AppConfig auth settings', () => {
  it('runs passkey ceremonies on the production web origin in production', () => {
    expect(new AppConfig(productionEnv).webOrigin).toBe(
      'https://dash.doublel.studio',
    );
  });

  it('runs passkey ceremonies on the local web origin in development', () => {
    expect(new AppConfig(developmentEnv).webOrigin).toBe(
      'http://localhost:5173',
    );
  });

  it('shares secure auth cookies with dash.doublel.studio in production', () => {
    const config = new AppConfig(productionEnv);

    expect(config.authCookieDomain).toBe('dash.doublel.studio');
    expect(config.secureCookies).toBe(true);
    expect(config.authBaseUrl).toBe('https://api.dash.doublel.studio');
  });

  it('keeps auth cookies host-only and non-secure in development', () => {
    const config = new AppConfig(developmentEnv);

    expect(config.authCookieDomain).toBeUndefined();
    expect(config.secureCookies).toBe(false);
  });

  it('rejects an auth secret shorter than 32 characters', () => {
    expect(
      () => new AppConfig({ ...productionEnv, BETTER_AUTH_SECRET: 'short' }),
    ).toThrow(ConfigError);
  });
});

describe('AppConfig auth secret', () => {
  it('knows the secret .env.example ships', async () => {
    const example = parseEnv(
      await readFile(
        new URL('../../../../../.env.example', import.meta.url),
        'utf8',
      ),
    );

    expect(example['BETTER_AUTH_SECRET']).toBe(developmentAuthSecret);
  });

  it('refuses the public development secret in production', () => {
    expect(
      () =>
        new AppConfig({
          ...productionEnv,
          BETTER_AUTH_SECRET: developmentAuthSecret,
        }),
    ).toThrow(ConfigError);
  });

  it('rejects a production auth URL outside the cookie domain', () => {
    expect(
      () =>
        new AppConfig({
          ...productionEnv,
          BETTER_AUTH_URL: 'https://mission-control.example.com',
        }),
    ).toThrow(ConfigError);
  });

  it('rejects a plain-http auth URL in production', () => {
    expect(
      () =>
        new AppConfig({
          ...productionEnv,
          BETTER_AUTH_URL: 'http://api.dash.doublel.studio',
        }),
    ).toThrow(ConfigError);
  });

  it('adds the local web origin in development', () => {
    const config = new AppConfig(developmentEnv);

    expect(config.corsOrigins).toEqual([
      'https://dash.doublel.studio',
      'http://localhost:5173',
    ]);
  });
});

describe('AppConfig build', () => {
  it('reads the version and commit bin/image bakes in', () => {
    const config = new AppConfig({
      ...productionEnv,
      APP_VERSION: 'v1.1.1',
      APP_COMMIT: '7615036f0c2b9a8e1d4f5a6b7c8d9e0f1a2b3c4d',
    });

    expect(config.build).toEqual({
      version: 'v1.1.1',
      commit: '7615036f0c2b9a8e1d4f5a6b7c8d9e0f1a2b3c4d',
    });
  });

  it.each([
    ['unset', {}],
    ['blank', { APP_VERSION: ' ', APP_COMMIT: '' }],
  ])('falls back to dev and no commit when %s', (_label, build) => {
    expect(new AppConfig({ ...developmentEnv, ...build }).build).toEqual({
      version: 'dev',
      commit: null,
    });
  });
});

describe('AppConfig GitHub App', () => {
  it('reads the App in production', () => {
    expect(new AppConfig(productionEnv).githubApp).toEqual({
      appId: '5947367',
      slug: 'good-ground-dash',
      clientId: 'Iv23-client',
      clientSecret: 'client-secret',
      privateKey: 'pem',
      webhookSecret: 'webhook-secret',
    });
  });

  it('runs without the App outside production', () => {
    expect(new AppConfig(developmentEnv).githubApp).toBeNull();
  });

  it('refuses to start production without the App', () => {
    expect(() => new AppConfig(productionEnvWithoutGithub)).toThrow(
      /Production needs the GitHub App/u,
    );
  });

  it('refuses half an App', () => {
    expect(
      () => new AppConfig({ ...developmentEnv, GITHUB_APP_ID: '5947367' }),
    ).toThrow(/or none of them/u);
  });
});

describe('AppConfig briefing', () => {
  const briefingEnv = { ...developmentEnv, OPENAI_API_KEY: 'sk-test' };
  const customBriefing = {
    OPENAI_API_KEY: 'sk-custom',
    BRIEFING_MODEL: 'gpt-custom',
    BRIEFING_INPUT_USD_PER_MTOK: '1.25',
    BRIEFING_CACHED_INPUT_USD_PER_MTOK: '0.125',
    BRIEFING_OUTPUT_USD_PER_MTOK: '10',
    BRIEFING_MONTHLY_BUDGET_USD: '25.5',
    BRIEFING_MAX_OUTPUT_TOKENS: '2000',
  };

  it.each([
    ['development', developmentEnv],
    ['production', productionEnv],
  ])('is off in %s when the API key is unset', (_label, env) => {
    expect(new AppConfig(env).briefing).toBeNull();
  });

  it('rejects an empty API key instead of silently turning the briefing off', () => {
    expect(
      () => new AppConfig({ ...developmentEnv, OPENAI_API_KEY: '' }),
    ).toThrow(/OPENAI_API_KEY/u);
  });

  it('uses the verified defaults when only the key is set', () => {
    expect(new AppConfig(briefingEnv).briefing).toEqual({
      apiKey: 'sk-test',
      model: 'gpt-6-luna',
      prices: {
        inputUsdPerMTok: 0.1,
        cachedInputUsdPerMTok: 0.01,
        outputUsdPerMTok: 0.5,
      },
      monthlyBudgetUsd: 100,
      maxOutputTokens: 4000,
    });
  });

  it('reads a full custom group', () => {
    expect(
      new AppConfig({ ...developmentEnv, ...customBriefing }).briefing,
    ).toEqual({
      apiKey: 'sk-custom',
      model: 'gpt-custom',
      prices: {
        inputUsdPerMTok: 1.25,
        cachedInputUsdPerMTok: 0.125,
        outputUsdPerMTok: 10,
      },
      monthlyBudgetUsd: 25.5,
      maxOutputTokens: 2000,
    });
  });
});

describe('AppConfig briefing validation', () => {
  const briefingEnv = { ...developmentEnv, OPENAI_API_KEY: 'sk-test' };

  it.each([
    ['BRIEFING_INPUT_USD_PER_MTOK', 'cheap'],
    ['BRIEFING_CACHED_INPUT_USD_PER_MTOK', 'cheap'],
    ['BRIEFING_OUTPUT_USD_PER_MTOK', 'cheap'],
    ['BRIEFING_MONTHLY_BUDGET_USD', 'lots'],
    ['BRIEFING_MONTHLY_BUDGET_USD', '-5'],
    ['BRIEFING_MAX_OUTPUT_TOKENS', '0'],
    ['BRIEFING_MAX_OUTPUT_TOKENS', '-1'],
    ['BRIEFING_MAX_OUTPUT_TOKENS', '1.5'],
    ['BRIEFING_MAX_OUTPUT_TOKENS', 'many'],
    ['BRIEFING_MODEL', ''],
  ])('rejects %s=%j and names the variable', (name, value) => {
    const build = (): AppConfig =>
      new AppConfig({ ...briefingEnv, [name]: value });

    expect(build).toThrow(ConfigError);
    expect(build).toThrow(new RegExp(name, 'u'));
  });
});
