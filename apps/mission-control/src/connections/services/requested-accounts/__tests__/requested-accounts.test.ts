import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  adaId,
  ConnectionsHarness,
  webOrigin,
} from '#src/connections/__tests__/support/connections-harness.ts';
import {
  acmeUserInstallation,
  globexProfile,
} from '#src/connections/__tests__/support/fake-connect-flow.ts';
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

describe('RequestedAccounts', () => {
  it('records a request made through a targeted link and lists it as requested', async () => {
    const harness = await reads.linked();

    const response = await InstallRequestReads.requestGlobex(harness);

    expect(response.headers.location).toBe(
      `${webOrigin}/setup/github?connect=requested&provider=github`,
    );
    await expect(InstallRequestReads.listed(harness)).resolves.toContainEqual(
      globexRequested,
    );
  });

  it('clears the request once the installation appears to the person', async () => {
    const harness = await reads.linked();
    await InstallRequestReads.requestGlobex(harness);
    harness.flow.visible = [
      {
        ...acmeUserInstallation,
        externalId: '43',
        account: { ...globexProfile, role: 'member' },
      },
    ];

    const listed = await InstallRequestReads.listed(harness);

    expect(
      listed.find(({ account }) => account.login === 'globex'),
    ).toMatchObject({
      account: { role: 'member' },
      install: { state: 'installed' },
    });
    await expect(
      harness.installRequests.list({ userId: adaId, provider: 'github' }),
    ).resolves.toEqual([]);
  });

  it('keeps a request whose account fails to load, without listing it', async () => {
    const harness = await reads.linked();
    await InstallRequestReads.requestGlobex(harness);
    harness.flow.unreadableAccounts.add('7070');

    const listed = await InstallRequestReads.listed(harness);

    expect(listed.map(({ account }) => account.login)).toEqual(['octocat']);
    await expect(
      harness.installRequests.list({ userId: adaId, provider: 'github' }),
    ).resolves.toHaveLength(1);
  });

  it('clears a request for an account that no longer exists', async () => {
    const harness = await reads.linked();
    await InstallRequestReads.requestGlobex(harness);
    harness.flow.organizations = [];

    await InstallRequestReads.listed(harness);

    await expect(
      harness.installRequests.list({ userId: adaId, provider: 'github' }),
    ).resolves.toEqual([]);
  });
});

describe('RequestedAccounts through an expired link', () => {
  it('says a request through a link that expired wasn’t recorded, and lists nothing', async () => {
    const harness = await reads.linked();

    const response = await InstallRequestReads.requestGlobex(harness, {
      lateByMs: 11 * 60 * 1000,
    });

    expect(response.headers.location).toBe(
      `${webOrigin}/setup/github?connect=error&provider=github&reason=request-unrecorded`,
    );
    expect(harness.installRequests.requests.size).toBe(0);
  });
});
