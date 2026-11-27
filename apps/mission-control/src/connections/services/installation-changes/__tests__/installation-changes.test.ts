import { beforeEach, describe, expect, it } from 'vitest';

import {
  acmeInstallation,
  FakeConnectFlow,
} from '#src/connections/__tests__/support/fake-connect-flow.ts';
import { InMemoryConnectionRepository } from '#src/connections/__tests__/support/in-memory-connections.ts';
import { OwnedInstallationChanges } from '#src/connections/services/installation-changes/installation-changes.ts';

const adaId = '00000000-0000-4000-8000-00000000000a';
const connections = new InMemoryConnectionRepository();
const changes = new OwnedInstallationChanges({
  flows: new Map([['github', new FakeConnectFlow()]]),
  connections,
});

class Stored {
  static async acme() {
    return (await connections.listOwned({ provider: 'github' }))[0];
  }
}

beforeEach(async () => {
  connections.owned.clear();
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
    await changes.apply({
      provider: 'github',
      installationId: '42',
      change: 'suspended',
    });
    expect(await Stored.acme()).toMatchObject({
      suspended: true,
      repositories: [],
    });

    await changes.apply({
      provider: 'github',
      installationId: '42',
      change: 'unsuspended',
    });
    expect(await Stored.acme()).toMatchObject({
      suspended: false,
      repositories: acmeInstallation.repositories,
    });
  });

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
