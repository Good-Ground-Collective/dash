import { readFile } from 'node:fs/promises';
import { parseEnv } from 'node:util';

import { describe, expect, it } from 'vitest';

import {
  AppConfig,
  developmentAuthSecret,
} from '#src/platform/definitions/config/app-config.ts';
import { ConfigError } from '#src/platform/errors.ts';

const databaseUrl = 'postgres://dash:dash@127.0.0.1:54329/mission_control';
const productionEnv = {
  NODE_ENV: 'production',
  DATABASE_URL: databaseUrl,
  BETTER_AUTH_SECRET: 'production-secret-that-is-long-enough',
  BETTER_AUTH_URL: 'https://api.dash.doublel.studio',
};
const developmentEnv = {
  ...productionEnv,
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
