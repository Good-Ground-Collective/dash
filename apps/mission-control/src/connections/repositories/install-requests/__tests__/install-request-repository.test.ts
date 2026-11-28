import {
  afterAll,
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  inject,
  it,
  vi,
} from 'vitest';

import { DrizzleInstallRequestRepository } from '#src/connections/repositories/install-requests/install-request-repository.ts';
import { adaId } from '#src/github-feed/__tests__/support/github-feed-fixtures.ts';
import { GithubRecordsDatabase } from '#src/github-feed/__tests__/support/github-records-database.ts';

const databaseUrl = inject('databaseUrl');
let store: GithubRecordsDatabase | undefined;

const ada = { userId: adaId, provider: 'github' };

class Stored {
  static repository() {
    return new DrizzleInstallRequestRepository({
      database: GithubRecordsDatabase.required(store).database,
    });
  }

  static async requestAt(props: { accountExternalId: string; at: string }) {
    vi.setSystemTime(new Date(props.at));
    await Stored.repository().record({
      ...ada,
      accountExternalId: props.accountExternalId,
    });
  }
}

beforeAll(async () => {
  if (databaseUrl !== null) {
    store = await GithubRecordsDatabase.open({
      serverUrl: databaseUrl,
      name: 'dash_test_install_requests',
    });
  }
});

beforeEach(async () => {
  vi.useFakeTimers({ toFake: ['Date'] });
  await store?.reset();
});

afterEach(() => {
  vi.useRealTimers();
});

afterAll(async () => {
  await store?.close();
});

describe.skipIf(databaseUrl === null)('DrizzleInstallRequestRepository', () => {
  it('lists a person’s requests oldest first', async () => {
    await Stored.requestAt({
      accountExternalId: '7',
      at: '2026-11-26T12:00:00Z',
    });
    await Stored.requestAt({
      accountExternalId: '9',
      at: '2026-11-25T12:00:00Z',
    });

    await expect(Stored.repository().list(ada)).resolves.toEqual([
      { accountExternalId: '9', requestedAt: '2026-11-25T12:00:00.000Z' },
      { accountExternalId: '7', requestedAt: '2026-11-26T12:00:00.000Z' },
    ]);
  });

  it('moves the time of a request made again', async () => {
    await Stored.requestAt({
      accountExternalId: '7',
      at: '2026-11-25T12:00:00Z',
    });
    await Stored.requestAt({
      accountExternalId: '7',
      at: '2026-11-26T12:00:00Z',
    });

    await expect(Stored.repository().list(ada)).resolves.toEqual([
      { accountExternalId: '7', requestedAt: '2026-11-26T12:00:00.000Z' },
    ]);
  });

  it('clears only the named accounts', async () => {
    await Stored.requestAt({
      accountExternalId: '7',
      at: '2026-11-25T12:00:00Z',
    });
    await Stored.requestAt({
      accountExternalId: '9',
      at: '2026-11-26T12:00:00Z',
    });

    await Stored.repository().clear({ ...ada, accountExternalIds: ['7'] });

    await expect(Stored.repository().list(ada)).resolves.toEqual([
      { accountExternalId: '9', requestedAt: '2026-11-26T12:00:00.000Z' },
    ]);
  });

  it('keeps another provider’s requests apart', async () => {
    await Stored.requestAt({
      accountExternalId: '7',
      at: '2026-11-25T12:00:00Z',
    });

    await expect(
      Stored.repository().list({ userId: adaId, provider: 'gitlab' }),
    ).resolves.toEqual([]);
  });
});
