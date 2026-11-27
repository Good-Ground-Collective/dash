import { afterEach, describe, expect, it } from 'vitest';

import {
  adaId,
  ConnectionsHarness,
  webOrigin,
} from '#src/connections/__tests__/support/connections-harness.ts';
import { acmeInstallation } from '#src/connections/__tests__/support/fake-connect-flow.ts';

const running: ConnectionsHarness[] = [];

class Served {
  /** A harness where Ada has already authorized the app. */
  static async linked(): Promise<ConnectionsHarness> {
    const harness = new ConnectionsHarness();
    running.push(harness);
    const state = await harness.issuedState({
      userId: adaId,
      url: 'authorizeUrl',
    });
    await (
      await harness.start()
    ).inject({
      url: `/integrations/github/callback?code=good&state=${state}`,
      headers: ConnectionsHarness.cookie(adaId),
    });
    return harness;
  }

  static async fresh(): Promise<ConnectionsHarness> {
    const harness = new ConnectionsHarness();
    running.push(harness);
    await harness.start();
    return harness;
  }

  static query(location: string | undefined) {
    const url = new URL(location ?? '');
    return {
      path: `${url.origin}${url.pathname}`,
      ...Object.fromEntries(url.searchParams),
    };
  }
}

afterEach(async () => {
  await Promise.all(running.splice(0).map(async (harness) => harness.stop()));
});

describe('ConnectionsModule install callback', () => {
  it('records the installation as an owned connection with its repositories', async () => {
    const harness = await Served.linked();
    const app = await harness.start();

    const response = await app.inject({
      url: '/integrations/github/setup?installation_id=42&setup_action=install',
      headers: ConnectionsHarness.cookie(adaId),
    });

    expect(Served.query(response.headers.location)).toEqual({
      path: `${webOrigin}/setup/github`,
      connect: 'installed',
      provider: 'github',
    });
    const status = await app.inject({
      url: '/integrations/github/connect',
      headers: ConnectionsHarness.cookie(adaId),
    });
    expect(status.json()).toMatchObject({
      account: { login: 'octocat' },
      connections: [
        {
          kind: 'owned',
          installationId: '42',
          account: { login: 'acme', kind: 'organization' },
          repositories: [{ fullName: 'acme/app' }],
          settingsUrl: acmeInstallation.url,
        },
      ],
    });
  });

  it('refuses an installation the linked account cannot manage', async () => {
    const harness = await Served.linked();

    const response = await (
      await harness.start()
    ).inject({
      url: '/integrations/github/setup?installation_id=7&setup_action=install',
      headers: ConnectionsHarness.cookie(adaId),
    });

    expect(Served.query(response.headers.location)).toMatchObject({
      connect: 'error',
      reason: 'not-yours',
    });
    expect(harness.connections.owned.size).toBe(0);
  });

  it('needs a Dash session', async () => {
    const harness = await Served.fresh();

    const response = await (
      await harness.start()
    ).inject({
      url: '/integrations/github/setup?installation_id=42&setup_action=install',
    });

    expect(Served.query(response.headers.location)).toMatchObject({
      connect: 'error',
      reason: 'signed-out',
    });
  });
});

describe('ConnectionsModule install before authorizing', () => {
  it('sends the person to authorize, then records the installation', async () => {
    const harness = await Served.fresh();
    const app = await harness.start();

    const setup = await app.inject({
      url: '/integrations/github/setup?installation_id=42&setup_action=install',
      headers: ConnectionsHarness.cookie(adaId),
    });
    expect(Served.query(setup.headers.location).path).toBe(
      'https://forge.test/authorize',
    );
    const state = ConnectionsHarness.stateOf(setup.headers.location);
    const callback = await app.inject({
      url: `/integrations/github/callback?code=good&state=${state}`,
      headers: ConnectionsHarness.cookie(adaId),
    });

    expect(Served.query(callback.headers.location)).toMatchObject({
      connect: 'installed',
    });
    expect(harness.connections.owned.size).toBe(1);
  });
});

describe('ConnectionsModule install requests', () => {
  it('records which account an owner was asked to install on', async () => {
    const harness = await Served.fresh();
    const state = ConnectionsHarness.requestState({
      userId: adaId,
      targetAccountId: '9919',
    });

    const response = await (
      await harness.start()
    ).inject({
      url: `/integrations/github/setup?setup_action=request&state=${state}`,
      headers: ConnectionsHarness.cookie(adaId),
    });

    expect(Served.query(response.headers.location)).toMatchObject({
      connect: 'requested',
    });
    expect(harness.connections.installRequests).toEqual([
      { userId: adaId, provider: 'github', accountExternalId: '9919' },
    ]);
  });
});
