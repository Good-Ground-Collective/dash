import { beforeEach, describe, expect, it, vi } from 'vitest';

import {
  acmeInstallation,
  FakeConnectFlow,
  ProviderUnavailableError,
} from '#src/connections/__tests__/support/fake-connect-flow.ts';
import { InMemoryConnectionRepository } from '#src/connections/__tests__/support/in-memory-connections.ts';
import { SuspensionRecheckNotRegisteredError } from '#src/connections/errors.ts';
import { DbosSuspensionRecheck } from '#src/connections/services/suspension-recheck/suspension-recheck.ts';

const adaId = '00000000-0000-4000-8000-00000000000a';
const connections = new InMemoryConnectionRepository();
const flow = new FakeConnectFlow();
const recheck = new DbosSuspensionRecheck({
  flows: new Map([['github', flow]]),
  connections,
});

class Stored {
  static async save(props: {
    installationId: string;
    suspended: boolean;
    updatedAt?: string;
  }): Promise<void> {
    await connections.saveOwned({
      provider: 'github',
      connectedBy: adaId,
      installation: {
        ...acmeInstallation,
        externalId: props.installationId,
        repositories: [],
        suspended: props.suspended,
      },
    });
    const key = `github:${props.installationId}`;
    const saved = connections.owned.get(key);
    if (saved !== undefined && props.updatedAt !== undefined) {
      connections.owned.set(key, { ...saved, updatedAt: props.updatedAt });
    }
  }

  static async find(installationId: string) {
    return (await connections.listOwned({ provider: 'github' })).find(
      (connection) => connection.installationId === installationId,
    );
  }
}

beforeEach(() => {
  connections.owned.clear();
  flow.suspendedInstallations.clear();
  flow.unavailableReads = 0;
});

describe('DbosSuspensionRecheck due', () => {
  it('lists suspended connections, least recently updated first', async () => {
    await Stored.save({
      installationId: '1',
      suspended: true,
      updatedAt: '2026-11-26T12:00:00.000Z',
    });
    await Stored.save({ installationId: '2', suspended: false });
    await Stored.save({
      installationId: '3',
      suspended: true,
      updatedAt: '2026-11-25T12:00:00.000Z',
    });

    await expect(recheck.due()).resolves.toEqual([
      { provider: 'github', installationId: '3' },
      { provider: 'github', installationId: '1' },
    ]);
  });

  it('asks about at most 50 connections a run', async () => {
    for (let id = 1; id <= 51; id += 1) {
      await Stored.save({ installationId: String(id), suspended: true });
    }

    await expect(recheck.due()).resolves.toHaveLength(50);
  });
});

describe('DbosSuspensionRecheck rotation', () => {
  it('moves connections the provider failed to answer for behind ones not yet asked about', async () => {
    for (let id = 1; id <= 51; id += 1) {
      await Stored.save({
        installationId: String(id),
        suspended: true,
        updatedAt: `2026-11-01T00:00:${String(id).padStart(2, '0')}.000Z`,
      });
    }
    flow.unavailableReads = 50;

    for (const installation of await recheck.due()) {
      await expect(recheck.recheck(installation)).rejects.toThrow(
        ProviderUnavailableError,
      );
    }

    expect((await recheck.due())[0]).toEqual({
      provider: 'github',
      installationId: '51',
    });
  });
});

describe('DbosSuspensionRecheck recheck', () => {
  it('reads the installation again once the provider no longer reports it suspended', async () => {
    await Stored.save({ installationId: '42', suspended: true });

    await expect(
      recheck.recheck({ provider: 'github', installationId: '42' }),
    ).resolves.toBe(true);
    expect(await Stored.find('42')).toMatchObject({
      suspended: false,
      repositories: acmeInstallation.repositories,
    });
  });

  it('keeps a suspension the provider still reports, and moves it to the back of the line', async () => {
    await Stored.save({
      installationId: '42',
      suspended: true,
      updatedAt: '2026-11-01T00:00:00.000Z',
    });
    flow.suspendedInstallations.add('42');

    await expect(
      recheck.recheck({ provider: 'github', installationId: '42' }),
    ).resolves.toBe(false);
    const stored = await Stored.find('42');
    expect(stored).toMatchObject({ suspended: true });
    expect(stored?.updatedAt).not.toBe('2026-11-01T00:00:00.000Z');
  });

  it('fails with the outage and keeps the suspension when the provider is unavailable', async () => {
    await Stored.save({ installationId: '42', suspended: true });
    flow.unavailableReads = 1;

    await expect(
      recheck.recheck({ provider: 'github', installationId: '42' }),
    ).rejects.toThrow(ProviderUnavailableError);
    expect(await Stored.find('42')).toMatchObject({ suspended: true });
  });

  it('fails with the outage even when moving the connection back fails too', async () => {
    await Stored.save({ installationId: '42', suspended: true });
    flow.unavailableReads = 1;
    vi.spyOn(connections, 'touchSuspended').mockRejectedValueOnce(
      new Error('database unavailable'),
    );

    await expect(
      recheck.recheck({ provider: 'github', installationId: '42' }),
    ).rejects.toThrow(ProviderUnavailableError);
  });

  it('leaves alone a provider without a connect flow', async () => {
    await expect(
      recheck.recheck({ provider: 'jira', installationId: '42' }),
    ).resolves.toBe(false);
  });

  it('refuses to schedule before its workflow is registered', async () => {
    await expect(recheck.activate()).rejects.toThrow(
      SuspensionRecheckNotRegisteredError,
    );
  });
});
