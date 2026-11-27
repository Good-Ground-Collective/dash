import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { z } from 'zod';

import {
  adaId,
  baseUrl,
  ConnectionsHarness,
} from '#src/connections/__tests__/support/connections-harness.ts';
import {
  acmeInstallation,
  acmeUserInstallation,
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

  /** An installation of the app on an organisation called `login`. */
  static organisation(props: { login: string; installationId: string }) {
    return {
      ...acmeUserInstallation,
      externalId: props.installationId,
      account: {
        ...acmeUserInstallation.account,
        externalId: `${props.installationId}00`,
        login: props.login,
      },
    };
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
            incomplete: false,
            settingsUrl: acmeInstallation.url,
            connectionId: null,
          },
        },
      ],
    });
  });

  it('passes on an installation the provider could only partly read', async () => {
    const harness = await Accounts.linked();
    harness.flow.visible = [
      {
        ...acmeUserInstallation,
        account: { ...acmeUserInstallation.account, role: null },
        repositoryCount: null,
        incomplete: true,
      },
    ];

    const listed = await Accounts.listed(harness);

    expect(listed[1]).toMatchObject({
      account: { login: 'acme', role: null },
      install: { state: 'installed', repositoryCount: null, incomplete: true },
    });
  });
});

describe('AccountsRoutes installed accounts', () => {
  it('puts the personal account first, then installed accounts by login', async () => {
    const harness = await Accounts.linked();
    harness.flow.visible = [
      Accounts.organisation({ login: 'zeta', installationId: '51' }),
      Accounts.organisation({ login: 'beta', installationId: '52' }),
      Accounts.organisation({ login: 'mu', installationId: '53' }),
    ];

    const listed = await Accounts.listed(harness);

    expect(listed.map(({ account }) => account.login)).toEqual([
      'octocat',
      'beta',
      'mu',
      'zeta',
    ]);
  });

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

describe('AccountsRoutes without a usable grant', () => {
  it('needs a Dash session', async () => {
    const harness = await Accounts.fresh();

    const response = await (
      await harness.start()
    ).inject({ url: '/integrations/github/accounts' });

    expect(response.statusCode).toBe(401);
  });

  it('asks a person who hasn’t authorized to authorize, back through the same callback as /connect', async () => {
    const harness = await Accounts.fresh();

    const response = await Accounts.read(harness);

    expect(response.status).toBe('authorize');
    const authorizeUrl =
      response.status === 'authorize' ? response.authorizeUrl : '';
    expect(new URL(authorizeUrl).searchParams.get('redirect_uri')).toBe(
      `${baseUrl}/integrations/github/callback`,
    );
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
