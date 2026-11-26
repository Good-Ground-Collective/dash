import { describe, expect, it } from 'vitest';

import { AppConfig } from '#src/platform/definitions/config/app-config.ts';
import { ConfigError } from '#src/platform/errors.ts';

const databaseUrl = 'postgres://dash:dash@127.0.0.1:54329/mission_control';

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
          NODE_ENV: 'production',
          DATABASE_URL: 'mysql://127.0.0.1/db',
        }),
    ).toThrow(ConfigError);
  });

  it('allows only the production web origin outside development', () => {
    const config = new AppConfig({
      NODE_ENV: 'production',
      DATABASE_URL: databaseUrl,
    });

    expect(config.corsOrigins).toEqual(['https://dash.doublel.studio']);
    expect(config.port).toBe(3000);
  });

  it('adds the local web origin in development', () => {
    const config = new AppConfig({
      NODE_ENV: 'development',
      DATABASE_URL: databaseUrl,
    });

    expect(config.corsOrigins).toEqual([
      'https://dash.doublel.studio',
      'http://localhost:5173',
    ]);
  });
});
