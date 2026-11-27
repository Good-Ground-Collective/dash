import { DBOS } from '@dbos-inc/dbos-sdk';
import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  inject,
  it,
  vi,
} from 'vitest';

import { DbosConnectionsFixture } from '#src/connections/__tests__/support/dbos-connections-fixture.ts';

const databaseUrl = inject('databaseUrl');
const settle = { timeout: 15_000, interval: 100 };
const fixture = new DbosConnectionsFixture();
const { harness, listener } = fixture;

beforeAll(async () => {
  if (databaseUrl !== null) {
    await fixture.launch({
      databaseUrl,
      database: 'dash_test_suspension_recheck',
    });
  }
});

beforeEach(() => {
  harness.flow.unavailableReads = 0;
});

afterAll(async () => {
  await fixture.stop();
});

describe.skipIf(databaseUrl === null)('Suspension recheck on DBOS', () => {
  const recheck = async () =>
    DBOS.triggerSchedule('connections-suspension-recheck-every-15-minutes');

  it('reinstates a connection whose suspension lifted without a webhook saying so', async () => {
    const { installationId } = await fixture.owned({
      suspended: true,
    });

    await recheck();

    await vi.waitFor(async () => {
      expect(await fixture.connection(installationId)).toMatchObject({
        suspended: false,
      });
    }, settle);
    await vi.waitFor(() => {
      expect(listener.reinstatedInstallations).toContain(installationId);
    }, settle);
  }, 30_000);

  it('keeps a suspension the provider still reports', async () => {
    const { installationId } = await fixture.owned({
      suspended: true,
    });
    harness.flow.suspendedInstallations.add(installationId);
    const before = (await fixture.connection(installationId))?.updatedAt;

    await recheck();

    await vi.waitFor(async () => {
      expect((await fixture.connection(installationId))?.updatedAt).not.toBe(
        before,
      );
    }, settle);
    expect(await fixture.connection(installationId)).toMatchObject({
      suspended: true,
    });
    expect(listener.reinstatedInstallations).not.toContain(installationId);
  }, 30_000);
});
