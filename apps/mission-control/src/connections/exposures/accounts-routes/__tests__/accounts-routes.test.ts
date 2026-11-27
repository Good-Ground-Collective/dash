import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { z } from 'zod';

import {
  adaId,
  ConnectionsHarness,
} from '#src/connections/__tests__/support/connections-harness.ts';
import {
  acmeInstallation,
  acmeUserInstallation,
  globexProfile,
  octocatProfile,
} from '#src/connections/__tests__/support/fake-connect-flow.ts';
import {
  accountsResponseSchema,
  type ConnectableAccount,
} from '#src/connections/contracts/connections.ts';

const running: ConnectionsHarness[] = [];

class Accounts {
  /** A harness where Ada has already authorized the app. */
  static async linked(): Promise<ConnectionsHarness> {
    const harness = await Accounts.fresh();
    await harness.link({ userId: adaId });
    return harness;
  }

  static async fresh(): Promise<ConnectionsHarness> {
    const harness = new ConnectionsHarness();
    running.push(harness);
    await harness.start();
    return harness;
  }

  static async read(
    harness: ConnectionsHarness,
  ): Promise<z.output<typeof accountsResponseSchema>> {
    const response = await (
      await harness.start()
    ).inject({
      url: '/integrations/github/accounts?returnTo=/setup/github',
      headers: ConnectionsHarness.cookie(adaId),
    });
    return accountsResponseSchema.parse(response.json());
  }

  static async listed(
    harness: ConnectionsHarness,
  ): Promise<ConnectableAccount[]> {
    const response = await Accounts.read(harness);
    if (response.status !== 'linked') {
      throw new Error(`Expected linked accounts, got ${response.status}`);
    }
    return response.accounts;
  }

  /** Comes back from the provider's install page after asking an owner to install on `targetAccountId`. */
  static async request(props: {
    harness: ConnectionsHarness;
    targetAccountId: string;
  }): Promise<void> {
    const state = ConnectionsHarness.requestState({
      userId: adaId,
      targetAccountId: props.targetAccountId,
    });
    await (
      await props.harness.start()
    ).inject({
      url: `/integrations/github/setup?setup_action=request&state=${state}`,
      headers: ConnectionsHarness.cookie(adaId),
    });
  }
}

beforeEach(() => {
  ConnectionsHarness.freezeClock();
});

afterEach(async () => {
  await Promise.all(running.splice(0).map(async (harness) => harness.stop()));
  vi.useRealTimers();
});

describe('AccountsRoutes linked', () => {
  it('lists the personal account to install on and the installed organisations', async () => {
    const harness = await Accounts.linked();

    await expect(Accounts.read(harness)).resolves.toEqual({
      status: 'linked',
      addAccountUrl: expect.stringMatching(
        /^https:\/\/forge\.test\/install\?state=[^&]+$/u,
      ),
      accounts: [
        {
          account: { ...octocatProfile, role: 'personal' },
          install: {
            state: 'installable',
            installUrl: expect.stringContaining('target_id=583231'),
          },
        },
        {
          account: acmeUserInstallation.account,
          install: {
            state: 'installed',
            installationId: '42',
            repositorySelection: 'selected',
            repositoryCount: 1,
            suspended: false,
            settingsUrl: acmeInstallation.url,
            connectionId: null,
          },
        },
      ],
    });
  });

  it('names the account in an install link’s state, so a request records it', async () => {
    const harness = await Accounts.linked();
    const [personal] = await Accounts.listed(harness);
    const installUrl =
      personal?.install.state === 'installable'
        ? personal.install.installUrl
        : undefined;

    await (
      await harness.start()
    ).inject({
      url: `/integrations/github/setup?setup_action=request&state=${ConnectionsHarness.stateOf(installUrl)}`,
      headers: ConnectionsHarness.cookie(adaId),
    });

    expect(harness.connections.installRequests).toMatchObject([
      { accountExternalId: '583231' },
    ]);
  });
});

describe('AccountsRoutes installed accounts', () => {
  it('links an installation Dash recorded to its connection', async () => {
    const harness = await Accounts.linked();
    await (
      await harness.start()
    ).inject({
      url: '/integrations/github/setup?installation_id=42&setup_action=install',
      headers: ConnectionsHarness.cookie(adaId),
    });

    const listed = await Accounts.listed(harness);

    const [connection] = harness.connections.owned.values();
    expect(listed[1]?.install).toMatchObject({
      state: 'installed',
      connectionId: connection?.id,
    });
  });

  it('puts the personal account first once the app is installed on it', async () => {
    const harness = await Accounts.linked();
    harness.flow.visible = [
      acmeUserInstallation,
      {
        ...acmeUserInstallation,
        externalId: '77',
        url: 'https://github.com/settings/installations/77',
        account: { ...octocatProfile, role: 'personal' },
        repositorySelection: 'all',
      },
    ];

    await expect(Accounts.listed(harness)).resolves.toMatchObject([
      { account: { login: 'octocat' }, install: { state: 'installed' } },
      { account: { login: 'acme' }, install: { state: 'installed' } },
    ]);
  });
});

describe('AccountsRoutes install requests', () => {
  it('lists an account the person asked an owner to install on', async () => {
    const harness = await Accounts.linked();
    await Accounts.request({
      harness,
      targetAccountId: globexProfile.externalId,
    });

    await expect(Accounts.listed(harness)).resolves.toContainEqual({
      account: { ...globexProfile, role: 'member' },
      install: { state: 'requested', requestedAt: '2026-11-26T12:00:00.000Z' },
    });
  });

  it('shows a requested account as installed once the owner installs it', async () => {
    const harness = await Accounts.linked();
    await Accounts.request({ harness, targetAccountId: '9919' });

    await expect(Accounts.listed(harness)).resolves.toMatchObject([
      { account: { login: 'octocat' } },
      { account: { login: 'acme' }, install: { state: 'installed' } },
    ]);
  });

  it('drops a request for an account that no longer exists', async () => {
    const harness = await Accounts.linked();
    await Accounts.request({ harness, targetAccountId: '404404' });

    await expect(Accounts.listed(harness)).resolves.toHaveLength(2);
  });
});

describe('AccountsRoutes without a usable grant', () => {
  it('needs a Dash session', async () => {
    const harness = await Accounts.fresh();

    const response = await (
      await harness.start()
    ).inject({ url: '/integrations/github/accounts' });

    expect(response.statusCode).toBe(401);
  });

  it('asks a person who hasn’t authorized to authorize', async () => {
    const harness = await Accounts.fresh();

    await expect(Accounts.read(harness)).resolves.toEqual({
      status: 'authorize',
      authorizeUrl: expect.stringContaining('https://forge.test/authorize?'),
    });
  });

  it('asks to authorize again when the provider refuses the token', async () => {
    const harness = await Accounts.linked();
    harness.flow.revoked.add('access-1');

    await expect(Accounts.read(harness)).resolves.toMatchObject({
      status: 'authorize',
    });
  });

  it('asks to authorize again when the provider refuses the refresh', async () => {
    const harness = await Accounts.linked();
    harness.flow.refusesRefresh = true;
    vi.setSystemTime(new Date('2026-11-26T21:00:00Z'));

    await expect(Accounts.read(harness)).resolves.toMatchObject({
      status: 'authorize',
    });
    expect(harness.flow.refreshed).toEqual(['refresh-1']);
  });
});
