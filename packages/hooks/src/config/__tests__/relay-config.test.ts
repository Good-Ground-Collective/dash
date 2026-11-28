import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { inspect } from 'node:util';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { RelayConfig } from '#src/config/relay-config.js';
import {
  RelayConfigExposedError,
  RelayConfigInvalidError,
} from '#src/errors.js';

const apiKey = 'dash_dev_secret-key-value';

let configHome: string;

beforeEach(() => {
  configHome = mkdtempSync(path.join(tmpdir(), 'dash-relay-config-'));
});

afterEach(() => {
  rmSync(configHome, { recursive: true, force: true });
});

/** Writes `dash/hooks.json` under the test's config home. */
class ConfigFile {
  static write(
    settings: { apiUrl: string; apiKey: string; reporterName: string },
    mode = 0o600,
  ): void {
    mkdirSync(path.join(configHome, 'dash'));
    writeFileSync(
      path.join(configHome, 'dash', 'hooks.json'),
      JSON.stringify(settings),
      { mode },
    );
  }
}

describe('RelayConfig.load', () => {
  it('reads the owner-only file, letting each DASH_ variable override its field', async () => {
    ConfigFile.write({
      apiUrl: 'https://dash.example.com/',
      apiKey,
      reporterName: 'seth-laptop',
    });

    const config = await RelayConfig.load({
      XDG_CONFIG_HOME: configHome,
      DASH_REPORTER_NAME: 'seth-desktop',
    });

    expect(config?.apiKey).toBe(apiKey);
    expect(config?.batchUrl).toBe(
      'https://dash.example.com/api/agents/seth-desktop/heartbeats/batch',
    );
  });

  it('is undefined when nothing configures a relay', async () => {
    expect(
      await RelayConfig.load({ XDG_CONFIG_HOME: configHome }),
    ).toBeUndefined();
  });

  it('refuses a file other users can read', async () => {
    ConfigFile.write(
      { apiUrl: 'https://dash.example.com', apiKey, reporterName: 'a' },
      0o644,
    );

    await expect(
      RelayConfig.load({ XDG_CONFIG_HOME: configHome }),
    ).rejects.toThrow(RelayConfigExposedError);
  });

  it('names the fields that are missing or wrong, never their values', async () => {
    const loading = RelayConfig.load({
      XDG_CONFIG_HOME: configHome,
      DASH_API_KEY: 'not-a-dash-key-but-secret',
    });

    await expect(loading).rejects.toThrow(RelayConfigInvalidError);
    await expect(loading).rejects.toThrow(/apiUrl, apiKey, reporterName/);
    await expect(loading).rejects.not.toThrow(/not-a-dash-key-but-secret/);
  });
});

describe('RelayConfig', () => {
  it('keeps the key out of JSON and inspection', () => {
    const config = new RelayConfig({
      apiUrl: 'https://dash.example.com',
      apiKey,
      reporterName: 'seth-laptop',
    });

    expect(JSON.stringify(config)).not.toContain(apiKey);
    expect(inspect(config)).not.toContain(apiKey);
    expect(config.fingerprint).not.toContain(apiKey);
  });
});
