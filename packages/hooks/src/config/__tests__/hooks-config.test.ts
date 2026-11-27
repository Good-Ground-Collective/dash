import { homedir } from 'node:os';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

import { HooksConfig } from '#src/config/hooks-config.js';

const defaultDirectory = path.join(homedir(), '.local', 'state', 'dash');

describe('HooksConfig.fromEnvironment state directory', () => {
  it('uses an absolute DASH_STATE_DIR as is', () => {
    const config = HooksConfig.fromEnvironment({
      DASH_STATE_DIR: '/var/dash',
      XDG_STATE_HOME: '/xdg',
    });

    expect(config.stateDirectory).toBe('/var/dash');
    expect(config.outboxDirectory).toBe('/var/dash/outbox');
  });

  it('puts the directory under an absolute XDG_STATE_HOME', () => {
    const config = HooksConfig.fromEnvironment({ XDG_STATE_HOME: '/xdg' });

    expect(config.stateDirectory).toBe('/xdg/dash');
  });

  it('falls back to ~/.local/state/dash when neither is set', () => {
    expect(HooksConfig.fromEnvironment({}).stateDirectory).toBe(
      defaultDirectory,
    );
  });

  it('ignores a relative DASH_STATE_DIR', () => {
    const config = HooksConfig.fromEnvironment({
      DASH_STATE_DIR: './state',
      XDG_STATE_HOME: '/xdg',
    });

    expect(config.stateDirectory).toBe('/xdg/dash');
  });

  it('ignores a relative XDG_STATE_HOME', () => {
    const config = HooksConfig.fromEnvironment({ XDG_STATE_HOME: 'state' });

    expect(config.stateDirectory).toBe(defaultDirectory);
  });
});

describe('HooksConfig.fromEnvironment outbox retention', () => {
  it.each([
    ['3', 3],
    ['abc', 7],
    ['0', 7],
    ['-2', 7],
    [undefined, 7],
  ])('reads DASH_OUTBOX_RETENTION_DAYS=%s as %i days', (value, days) => {
    const config = HooksConfig.fromEnvironment({
      DASH_STATE_DIR: '/var/dash',
      DASH_OUTBOX_RETENTION_DAYS: value,
    });

    expect(config.outboxRetentionDays).toBe(days);
  });
});
