import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  adaId,
  ConnectionsHarness,
} from '#src/connections/__tests__/support/connections-harness.ts';
import { globexProfile } from '#src/connections/__tests__/support/fake-connect-flow.ts';
import {
  globexRequested,
  InstallRequestReads,
} from '#src/connections/__tests__/support/install-request-reads.ts';

const reads = new InstallRequestReads();

beforeEach(() => {
  ConnectionsHarness.freezeClock();
});

afterEach(async () => {
  await reads.stopAll();
  vi.useRealTimers();
});

describe('OrganizationLookup', () => {
  it('finds an organisation by login with a link targeted at it', async () => {
    const harness = await reads.linked();

    const found = await InstallRequestReads.lookUp(harness, 'globex');

    expect(found).toEqual({
      status: 'found',
      entry: {
        account: { ...globexProfile, role: null },
        install: {
          state: 'requestable',
          installUrl: expect.stringContaining('target_id=7070'),
        },
      },
    });
  });

  it('answers missing for a login no organisation has', async () => {
    const harness = await reads.linked();

    await expect(
      InstallRequestReads.lookUp(harness, 'nobody'),
    ).resolves.toEqual({
      status: 'missing',
    });
  });

  it('shows an organisation already asked for as requested', async () => {
    const harness = await reads.linked();
    await InstallRequestReads.requestGlobex(harness);

    await expect(
      InstallRequestReads.lookUp(harness, 'globex'),
    ).resolves.toEqual({
      status: 'found',
      entry: globexRequested,
    });
  });

  it('asks to authorize again when the provider refuses the token', async () => {
    const harness = await reads.linked();
    harness.flow.revoked.add('access-1');

    await expect(
      InstallRequestReads.lookUp(harness, 'globex'),
    ).resolves.toMatchObject({
      status: 'authorize',
    });
  });
});

describe('OrganizationLookup logins', () => {
  it.each(['a%2Fb', '.', '..', 'a_b', '-a', 'a-', 'a--b', 'a'.repeat(40)])(
    'rejects %s, which no GitHub login can be, before asking the provider',
    async (login) => {
      const harness = await reads.linked();

      const response = await (
        await harness.start()
      ).inject({
        url: `/integrations/github/accounts/lookup?login=${login}`,
        headers: ConnectionsHarness.cookie(adaId),
      });

      expect(response.statusCode).toBe(400);
    },
  );

  it('accepts a 39-character login with single dashes', async () => {
    const harness = await reads.linked();

    await expect(
      InstallRequestReads.lookUp(harness, `a-${'b'.repeat(37)}`),
    ).resolves.toEqual({ status: 'missing' });
  });
});
