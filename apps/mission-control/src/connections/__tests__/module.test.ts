import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  adaId,
  baseUrl,
  ConnectionsHarness,
  graceId,
  webOrigin,
} from '#src/connections/__tests__/support/connections-harness.ts';
import { octocatAccount } from '#src/connections/__tests__/support/fake-connect-flow.ts';

const running: ConnectionsHarness[] = [];

class Served {
  static async harness(
    props: { offerFlow?: boolean } = {},
  ): Promise<ConnectionsHarness> {
    const harness = new ConnectionsHarness(props);
    running.push(harness);
    await harness.start();
    return harness;
  }

  static redirect(location: string | undefined) {
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

describe('ConnectionsModule connect', () => {
  it('needs a person signed in', async () => {
    const app = await (await Served.harness()).start();

    const response = await app.inject({ url: '/integrations/github/connect' });

    expect(response.statusCode).toBe(401);
    expect(response.json()).toMatchObject({ code: 'SIGN_IN_REQUIRED' });
  });

  it('hands out install and authorize URLs before anything is linked', async () => {
    const app = await (await Served.harness()).start();

    const response = await app.inject({
      url: '/integrations/github/connect?returnTo=/settings/connections',
      headers: ConnectionsHarness.cookie(adaId),
    });

    expect(response.statusCode).toBe(200);
    const body = response.json<{ installUrl: string; authorizeUrl: string }>();
    expect(response.json()).toMatchObject({ account: null, connections: [] });
    expect(Served.redirect(body.authorizeUrl)).toMatchObject({
      path: 'https://forge.test/authorize',
      redirect_uri: `${baseUrl}/integrations/github/callback`,
    });
    expect(Served.redirect(body.installUrl).path).toBe(
      'https://forge.test/install',
    );
  });

  it('refuses a return path on another origin', async () => {
    const app = await (await Served.harness()).start();

    const response = await app.inject({
      url: '/integrations/github/connect?returnTo=//evil.example',
      headers: ConnectionsHarness.cookie(adaId),
    });

    expect(response.statusCode).toBe(400);
  });

  it('serves no routes when no provider offers a connect flow', async () => {
    const app = await (await Served.harness({ offerFlow: false })).start();

    const response = await app.inject({
      url: '/integrations/github/connect',
      headers: ConnectionsHarness.cookie(adaId),
    });

    expect(response.statusCode).toBe(404);
  });
});

describe('ConnectionsModule OAuth callback', () => {
  it('links the account and returns to the web app', async () => {
    const harness = await Served.harness();
    const state = await harness.issuedState({
      userId: adaId,
      url: 'authorizeUrl',
    });

    const response = await (
      await harness.start()
    ).inject({
      url: `/integrations/github/callback?code=good&state=${state}`,
      headers: ConnectionsHarness.cookie(adaId),
    });

    expect(response.statusCode).toBe(302);
    expect(Served.redirect(response.headers.location)).toEqual({
      path: `${webOrigin}/setup/github`,
      connect: 'linked',
      provider: 'github',
    });
    await expect(
      harness.module.owned.get('github')?.linkedAccount({ userId: adaId }),
    ).resolves.toEqual(octocatAccount);
  });

  it('refuses a state issued to someone else, which is the CSRF check', async () => {
    const harness = await Served.harness();
    const state = await harness.issuedState({
      userId: graceId,
      url: 'authorizeUrl',
    });

    const response = await (
      await harness.start()
    ).inject({
      url: `/integrations/github/callback?code=good&state=${state}`,
      headers: ConnectionsHarness.cookie(adaId),
    });

    expect(Served.redirect(response.headers.location)).toMatchObject({
      connect: 'error',
      reason: 'state',
    });
    expect(harness.linkedAccounts.rows.size).toBe(0);
  });

  it('reports a denied authorization', async () => {
    const harness = await Served.harness();
    const state = await harness.issuedState({
      userId: adaId,
      url: 'authorizeUrl',
    });

    const response = await (
      await harness.start()
    ).inject({
      url: `/integrations/github/callback?error=access_denied&state=${state}`,
      headers: ConnectionsHarness.cookie(adaId),
    });

    expect(Served.redirect(response.headers.location)).toMatchObject({
      connect: 'error',
      reason: 'denied',
    });
  });
});

describe('ConnectionsModule token storage', () => {
  it('stores the token sealed, never in plaintext', async () => {
    const harness = await Served.harness();
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

    const [stored] = harness.linkedAccounts.rows.values();
    expect(stored?.sealedAccessToken).toMatch(/^v1\./u);
    expect(JSON.stringify(stored)).not.toContain('access-1');
    expect(JSON.stringify(stored)).not.toContain('refresh-1');
  });
});
