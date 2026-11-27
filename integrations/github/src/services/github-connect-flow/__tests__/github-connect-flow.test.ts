import { afterEach, describe, expect, it, vi } from 'vitest';
import { ZodError } from 'zod';

import {
  appConfig,
  appPrivateKey,
  FakeGithub,
  redirectUrl,
} from '#src/__tests__/support/fake-github.ts';
import { GithubConnectFlow } from '#src/services/github-connect-flow/github-connect-flow.ts';

afterEach(() => {
  vi.useRealTimers();
});

describe('GithubConnectFlow URLs', () => {
  const flow = new FakeGithub().flow();

  it('installs through the App page, handing state back', () => {
    expect(flow.installUrl({ state: 'abc' })).toBe(
      'https://github.com/apps/dash-test/installations/new?state=abc',
    );
  });

  it('preselects an account on the permissions page', () => {
    expect(flow.installUrl({ state: 'abc', targetAccountId: '42' })).toBe(
      'https://github.com/apps/dash-test/installations/new/permissions?target_id=42&state=abc',
    );
  });

  it('authorizes with the client id, redirect and state', () => {
    const url = new URL(flow.authorizeUrl({ state: 'abc', redirectUrl }));

    expect(`${url.origin}${url.pathname}`).toBe(
      'https://github.com/login/oauth/authorize',
    );
    expect(Object.fromEntries(url.searchParams)).toEqual({
      client_id: appConfig.clientId,
      redirect_uri: redirectUrl,
      state: 'abc',
    });
  });
});

describe('GithubConnectFlow config', () => {
  it('rejects a private key that is not a PEM', () => {
    const config = { ...appConfig, privateKey: 'not-a-key' };

    expect(() => new GithubConnectFlow({ config })).toThrow(ZodError);
  });

  it('accepts a key whose newlines arrive escaped', () => {
    const escaped = appPrivateKey.replaceAll('\n', String.raw`\n`);
    const config = { ...appConfig, privateKey: escaped };

    expect(() => new GithubConnectFlow({ config })).not.toThrow();
  });
});
