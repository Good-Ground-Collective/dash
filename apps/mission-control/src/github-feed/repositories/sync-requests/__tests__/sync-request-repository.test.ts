import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  inject,
  it,
} from 'vitest';

import {
  fixedNow,
  ownedId,
} from '#src/github-feed/__tests__/support/github-feed-fixtures.ts';
import { GithubRecordsDatabase } from '#src/github-feed/__tests__/support/github-records-database.ts';
import { DrizzleSyncRequestRepository } from '#src/github-feed/repositories/sync-requests/sync-request-repository.ts';

const databaseUrl = inject('databaseUrl');
const earlier = new Date(fixedNow.getTime() - 60_000);
let store: GithubRecordsDatabase | undefined;

class Stored {
  static requests() {
    return new DrizzleSyncRequestRepository({
      database: GithubRecordsDatabase.required(store).database,
    });
  }
}

beforeAll(async () => {
  if (databaseUrl !== null) {
    store = await GithubRecordsDatabase.open({
      serverUrl: databaseUrl,
      name: 'dash_test_sync_requests',
    });
  }
});

beforeEach(async () => {
  await store?.reset();
});

afterAll(async () => {
  await store?.close();
});

describe.skipIf(databaseUrl === null)('DrizzleSyncRequestRepository', () => {
  it('answers whether a change was reported since a moment', async () => {
    await Stored.requests().request({
      connectionId: ownedId,
      requestedAt: fixedNow,
    });

    await expect(
      Stored.requests().requestedSince({
        connectionId: ownedId,
        since: earlier,
      }),
    ).resolves.toBe(true);
    await expect(
      Stored.requests().requestedSince({
        connectionId: ownedId,
        since: fixedNow,
      }),
    ).resolves.toBe(true);
    await expect(
      Stored.requests().requestedSince({
        connectionId: ownedId,
        since: new Date(fixedNow.getTime() + 1),
      }),
    ).resolves.toBe(false);
  });

  it('keeps the latest change when an older one arrives late', async () => {
    await Stored.requests().request({
      connectionId: ownedId,
      requestedAt: fixedNow,
    });
    await Stored.requests().request({
      connectionId: ownedId,
      requestedAt: earlier,
    });

    await expect(
      Stored.requests().requestedSince({
        connectionId: ownedId,
        since: fixedNow,
      }),
    ).resolves.toBe(true);
  });

  it('knows of no change for a connection nothing was reported for', async () => {
    await expect(
      Stored.requests().requestedSince({
        connectionId: ownedId,
        since: earlier,
      }),
    ).resolves.toBe(false);
  });
});
