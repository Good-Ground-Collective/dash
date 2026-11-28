import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { ConnectionsHarness } from '#src/connections/__tests__/support/connections-harness.ts';
import {
  acmeUserInstallation,
  globexProfile,
} from '#src/connections/__tests__/support/fake-connect-flow.ts';
import { InstallRequestReads } from '#src/connections/__tests__/support/install-request-reads.ts';

const reads = new InstallRequestReads();

beforeEach(() => {
  ConnectionsHarness.freezeClock();
});

afterEach(async () => {
  await reads.stopAll();
  vi.useRealTimers();
});

describe('ConnectableAccounts suggestions', () => {
  it('suggests public memberships that aren’t listed yet', async () => {
    const harness = await reads.linked();
    harness.flow.visible = [acmeUserInstallation];
    harness.flow.publicOrganizations = [
      acmeUserInstallation.account,
      globexProfile,
    ];

    const answer = await InstallRequestReads.read(harness);

    expect(answer.suggestions).toEqual([
      { login: 'globex', avatarUrl: globexProfile.avatarUrl },
    ]);
  });

  it('suggests nothing when the provider fails to give public memberships', async () => {
    const harness = await reads.linked();
    harness.flow.publicOrganizations = [globexProfile];
    harness.flow.publicOrganizationsFail = true;

    const answer = await InstallRequestReads.read(harness);

    expect(answer.suggestions).toEqual([]);
  });
});
