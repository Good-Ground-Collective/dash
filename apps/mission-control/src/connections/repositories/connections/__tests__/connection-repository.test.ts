import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  inject,
  it,
} from 'vitest';

import { acmeInstallation } from '#src/connections/__tests__/support/fake-connect-flow.ts';
import { DrizzleConnectionRepository } from '#src/connections/repositories/connections/connection-repository.ts';
import { adaId } from '#src/github-feed/__tests__/support/github-feed-fixtures.ts';
import { GithubRecordsDatabase } from '#src/github-feed/__tests__/support/github-records-database.ts';

const databaseUrl = inject('databaseUrl');
let store: GithubRecordsDatabase | undefined;

class Stored {
  static repository() {
    return new DrizzleConnectionRepository({
      database: GithubRecordsDatabase.required(store).database,
    });
  }

  /** Records a suspended installation 7, then suspends acme (42), so 7 is the least recently updated. */
  static async suspendBoth() {
    const repository = Stored.repository();
    await repository.saveOwned({
      provider: 'github',
      connectedBy: adaId,
      installation: { ...acmeInstallation, externalId: '7', suspended: true },
    });
    await repository.setSuspended({
      provider: 'github',
      installationId: '42',
      suspended: true,
    });
    return repository;
  }

  static async acme() {
    const owned = await Stored.repository().listOwned({ provider: 'github' });
    return owned.find(({ installationId }) => installationId === '42');
  }
}

beforeAll(async () => {
  if (databaseUrl !== null) {
    store = await GithubRecordsDatabase.open({
      serverUrl: databaseUrl,
      name: 'dash_test_connection_lifecycle',
    });
  }
});

beforeEach(async () => {
  await store?.reset();
});

afterAll(async () => {
  await store?.close();
});

describe.skipIf(databaseUrl === null)(
  'DrizzleConnectionRepository installation changes',
  () => {
    it('replaces the repositories of a recorded connection from a fresh read', async () => {
      await expect(
        Stored.repository().refreshOwned({
          provider: 'github',
          installation: acmeInstallation,
        }),
      ).resolves.toBe(true);

      expect((await Stored.acme())?.repositories).toEqual(
        acmeInstallation.repositories,
      );
    });

    it('refreshes nothing for an installation Dash has no connection for', async () => {
      await expect(
        Stored.repository().refreshOwned({
          provider: 'github',
          installation: { ...acmeInstallation, externalId: '7' },
        }),
      ).resolves.toBe(false);
      expect(
        await Stored.repository().hasInstallation({
          provider: 'github',
          installationId: '7',
        }),
      ).toBe(false);
    });

    it('records a suspension and its end', async () => {
      const target = { provider: 'github', installationId: '42' };

      await Stored.repository().setSuspended({ ...target, suspended: true });
      expect(await Stored.acme()).toMatchObject({ suspended: true });

      await Stored.repository().setSuspended({ ...target, suspended: false });
      expect(await Stored.acme()).toMatchObject({ suspended: false });
    });

    it('removes the connection of an uninstalled app', async () => {
      await Stored.repository().removeInstallation({
        provider: 'github',
        installationId: '42',
      });

      expect(await Stored.acme()).toBeUndefined();
    });
  },
);

describe.skipIf(databaseUrl === null)(
  'DrizzleConnectionRepository suspended connections',
  () => {
    it('lists suspended owned connections of the providers asked about, least recently updated first', async () => {
      const repository = await Stored.suspendBoth();

      await expect(
        repository.listSuspended({ providers: ['github'], limit: 50 }),
      ).resolves.toEqual([
        { provider: 'github', installationId: '7' },
        { provider: 'github', installationId: '42' },
      ]);
      await expect(
        repository.listSuspended({ providers: ['github'], limit: 1 }),
      ).resolves.toHaveLength(1);
      await expect(
        repository.listSuspended({ providers: ['jira'], limit: 50 }),
      ).resolves.toEqual([]);
    });

    it('moves a touched suspension to the back without touching an active connection', async () => {
      const repository = await Stored.suspendBoth();

      await repository.touchSuspended({
        provider: 'github',
        installationId: '7',
      });
      await expect(
        repository.listSuspended({ providers: ['github'], limit: 50 }),
      ).resolves.toEqual([
        { provider: 'github', installationId: '42' },
        { provider: 'github', installationId: '7' },
      ]);

      await repository.setSuspended({
        provider: 'github',
        installationId: '42',
        suspended: false,
      });
      const before = (await Stored.acme())?.updatedAt;
      await repository.touchSuspended({
        provider: 'github',
        installationId: '42',
      });
      expect((await Stored.acme())?.updatedAt).toBe(before);
    });
  },
);
