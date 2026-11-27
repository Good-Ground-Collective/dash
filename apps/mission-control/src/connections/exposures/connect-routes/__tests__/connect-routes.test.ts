import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  adaId,
  ConnectionsHarness,
  webOrigin,
} from '#src/connections/__tests__/support/connections-harness.ts';
import { acmeInstallation } from '#src/connections/__tests__/support/fake-connect-flow.ts';
import type { ConnectListener } from '#src/connections/contracts/connect-listener.ts';
import { CapturedLog } from '#src/platform/exposures/http/__tests__/support/captured-log.ts';

const running: ConnectionsHarness[] = [];

class Served {
  /** A harness where Ada has already authorized the app. */
  static async linked(): Promise<ConnectionsHarness> {
    const harness = new ConnectionsHarness();
    running.push(harness);
    await harness.link({ userId: adaId });
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

beforeEach(() => {
  ConnectionsHarness.freezeClock();
});

afterEach(async () => {
  await Promise.all(running.splice(0).map(async (harness) => harness.stop()));
  vi.useRealTimers();
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

describe('ConnectionsModule install with a refused grant', () => {
  it('sends the person to authorize again when the provider refuses their token', async () => {
    const harness = await Served.linked();
    harness.flow.revoked.add('access-1');

    const response = await (
      await harness.start()
    ).inject({
      url: '/integrations/github/setup?installation_id=42&setup_action=install',
      headers: ConnectionsHarness.cookie(adaId),
    });

    expect(Served.query(response.headers.location).path).toBe(
      'https://forge.test/authorize',
    );
    expect(harness.connections.owned.size).toBe(0);
  });

  it('sends the person to authorize again when the provider refuses the refresh', async () => {
    const harness = await Served.linked();
    harness.flow.refusesRefresh = true;
    vi.setSystemTime(new Date('2026-11-26T21:00:00Z'));

    const response = await (
      await harness.start()
    ).inject({
      url: '/integrations/github/setup?installation_id=42&setup_action=install',
      headers: ConnectionsHarness.cookie(adaId),
    });

    expect(Served.query(response.headers.location).path).toBe(
      'https://forge.test/authorize',
    );
    expect(harness.flow.refreshed).toEqual(['refresh-1']);
  });
});

describe('ConnectionsModule install requests', () => {
  it('sends the person back with the request noted and records no connection', async () => {
    const harness = await Served.fresh();
    const state = await harness.issuedState({
      userId: adaId,
      url: 'installUrl',
    });

    const response = await (
      await harness.start()
    ).inject({
      url: `/integrations/github/setup?setup_action=request&state=${state}`,
      headers: ConnectionsHarness.cookie(adaId),
    });

    expect(Served.query(response.headers.location)).toEqual({
      path: `${webOrigin}/setup/github`,
      connect: 'requested',
      provider: 'github',
    });
    expect(harness.connections.owned.size).toBe(0);
  });
});

describe('ConnectionsModule callback logs', () => {
  it('keeps the authorization code and state out of the request log', async () => {
    const harness = new ConnectionsHarness({ logLevel: 'info' });
    running.push(harness);
    const state = await harness.issuedState({
      userId: adaId,
      url: 'authorizeUrl',
    });
    const app = await harness.start();
    const log = new CapturedLog();
    log.attach(app);

    const response = await app.inject({
      url: `/integrations/github/callback?code=good&state=${state}`,
      headers: ConnectionsHarness.cookie(adaId),
    });

    expect(Served.query(response.headers.location)).toMatchObject({
      connect: 'linked',
    });
    expect(log.text()).toContain('"url":"/integrations/github/callback"');
    expect(log.text()).not.toContain(state);
    expect(log.text()).not.toContain('code=');
  });
});

class RecordingListener implements ConnectListener {
  readonly told: { provider: string; userId: string }[] = [];
  failure: Error | null = null;

  async connected(props: { provider: string; userId: string }): Promise<void> {
    this.told.push(props);
    if (this.failure !== null) {
      throw this.failure;
    }
  }
}

describe('ConnectionsModule connect listener', () => {
  it('is told once the person links their account and again once they install', async () => {
    const listener = new RecordingListener();
    const harness = new ConnectionsHarness({ listeners: [listener] });
    running.push(harness);
    await harness.link({ userId: adaId });

    await (
      await harness.start()
    ).inject({
      url: '/integrations/github/setup?installation_id=42&setup_action=install',
      headers: ConnectionsHarness.cookie(adaId),
    });

    expect(listener.told).toEqual([
      { provider: 'github', userId: adaId },
      { provider: 'github', userId: adaId },
    ]);
  });

  it('still finishes the install and tells the other listeners when one fails', async () => {
    const listener = new RecordingListener();
    const other = new RecordingListener();
    const harness = new ConnectionsHarness({ listeners: [listener, other] });
    running.push(harness);
    await harness.link({ userId: adaId });
    listener.failure = new Error('queue unavailable');
    other.told.length = 0;

    const response = await (
      await harness.start()
    ).inject({
      url: '/integrations/github/setup?installation_id=42&setup_action=install',
      headers: ConnectionsHarness.cookie(adaId),
    });

    expect(Served.query(response.headers.location)).toMatchObject({
      connect: 'installed',
    });
    expect(harness.connections.owned.size).toBe(1);
    expect(other.told).toEqual([{ provider: 'github', userId: adaId }]);
  });
});
