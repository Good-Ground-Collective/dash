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
import { GithubRecordsDatabase } from '#src/github-feed/__tests__/support/github-records-database.ts';

const databaseUrl = inject('databaseUrl');
let store: GithubRecordsDatabase | undefined;

class Stored {
  static repository() {
    return new DrizzleConnectionRepository({
      database: GithubRecordsDatabase.required(store).database,
    });
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
