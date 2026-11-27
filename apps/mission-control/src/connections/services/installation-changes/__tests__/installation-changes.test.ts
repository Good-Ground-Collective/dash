import type { InstallationChange } from '@dash/integrations-core';
import { beforeEach, describe, expect, it } from 'vitest';

import {
  acmeInstallation,
  FakeConnectFlow,
  ProviderUnavailableError,
} from '#src/connections/__tests__/support/fake-connect-flow.ts';
import { InMemoryConnectionRepository } from '#src/connections/__tests__/support/in-memory-connections.ts';
import { OwnedInstallationChanges } from '#src/connections/services/installation-changes/installation-changes.ts';

const adaId = '00000000-0000-4000-8000-00000000000a';
const connections = new InMemoryConnectionRepository();
const flow = new FakeConnectFlow();
const changes = new OwnedInstallationChanges({
  flows: new Map([['github', flow]]),
  connections,
});

class Changes {
  static async apply(change: InstallationChange): Promise<void> {
    await changes.apply({ provider: 'github', installationId: '42', change });
  }
}

class Stored {
  static async acme() {
    return (await connections.listOwned({ provider: 'github' }))[0];
  }
}

beforeEach(async () => {
  connections.owned.clear();
  flow.suspendedInstallations.clear();
  flow.unavailableReads = 0;
  await connections.saveOwned({
    provider: 'github',
    connectedBy: adaId,
    installation: { ...acmeInstallation, repositories: [] },
  });
});

describe('OwnedInstallationChanges', () => {
  it('removes the connection when the app is uninstalled', async () => {
    await changes.apply({
      provider: 'github',
      installationId: '42',
      change: 'removed',
    });

    expect(await Stored.acme()).toBeUndefined();
  });

  it('records a suspension, and reads the installation again when it is lifted', async () => {
    flow.suspendedInstallations.add('42');
    await Changes.apply('suspended');
    expect(await Stored.acme()).toMatchObject({
      suspended: true,
      repositories: [],
    });

    flow.suspendedInstallations.delete('42');
    await Changes.apply('unsuspended');
    expect(await Stored.acme()).toMatchObject({
      suspended: false,
      repositories: acmeInstallation.repositories,
    });
  });
});

describe('OwnedInstallationChanges during a provider outage', () => {
  it('fails with the outage and leaves the suspension recorded', async () => {
    await connections.setSuspended({
      provider: 'github',
      installationId: '42',
      suspended: true,
    });
    flow.unavailableReads = 1;

    await expect(Changes.apply('unsuspended')).rejects.toThrow(
      ProviderUnavailableError,
    );
    expect(await Stored.acme()).toMatchObject({ suspended: true });
  });
});

describe('OwnedInstallationChanges in any order', () => {
  it('leaves the connection readable when a suspension is processed after the unsuspension that lifted it', async () => {
    await Changes.apply('unsuspended');
    await Changes.apply('suspended');

    expect(await Stored.acme()).toMatchObject({
      suspended: false,
      repositories: acmeInstallation.repositories,
    });
  });

  it('keeps the connection suspended when an unsuspension is processed after a later suspension', async () => {
    flow.suspendedInstallations.add('42');

    await Changes.apply('suspended');
    await Changes.apply('unsuspended');

    expect(await Stored.acme()).toMatchObject({ suspended: true });
  });
});

describe('OwnedInstallationChanges for repositories', () => {
  it('reads the repositories again when they change', async () => {
    await changes.apply({
      provider: 'github',
      installationId: '42',
      change: 'repositoriesChanged',
    });

    expect(await Stored.acme()).toMatchObject({
      repositories: acmeInstallation.repositories,
    });
  });

  it('leaves alone an installation Dash has no connection for', async () => {
    await changes.apply({
      provider: 'github',
      installationId: '7',
      change: 'repositoriesChanged',
    });
    await changes.apply({
      provider: 'github',
      installationId: '7',
      change: 'suspended',
    });
    await changes.apply({
      provider: 'github',
      installationId: '7',
      change: 'removed',
    });

    expect(await connections.listOwned({ provider: 'github' })).toHaveLength(1);
    expect(await Stored.acme()).toMatchObject({ suspended: false });
  });
});
