import { afterEach, describe, expect, it, vi } from 'vitest';
import { ZodError } from 'zod';

import { GrantRevokedError } from '@dash/integrations-core';

import {
  appConfig,
  acmeInstallation,
  appPrivateKey,
  FakeGithub,
  redirectUrl,
} from '#src/__tests__/support/fake-github.ts';
import {
  Accounts,
  enterpriseInstallation,
  installationsUrl,
} from '#src/__tests__/support/fake-user-accounts.ts';
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

describe('GithubConnectFlow listUserInstallationIds', () => {
  it('lists every installation the user can manage, across pages, from the ids alone', async () => {
    const ids = Array.from({ length: 101 }, (_, index) => index + 1);
    const github = new FakeGithub().on({
      method: 'GET',
      url: installationsUrl,
      reply: ({ url }) => {
        const page = Number(url.searchParams.get('page'));
        const installations = ids
          .slice((page - 1) * 100, page * 100)
          .map((id) => ({ id }));
        return { body: { total_count: ids.length, installations } };
      },
    });

    const listed = await github
      .flow()
      .listUserInstallationIds({ accessToken: 'ghu_access' });

    expect(listed).toEqual(ids.map(String));
    expect(github.calls).toHaveLength(2);
  });

  it('counts an enterprise installation among those the user can manage', async () => {
    const ids = await Accounts.github({
      installations: [acmeInstallation, enterpriseInstallation],
    })
      .flow()
      .listUserInstallationIds({ accessToken: 'ghu_access' });

    expect(ids).toEqual(['42', '88']);
  });

  it('reports a token GitHub refuses as a revoked grant', async () => {
    const github = new FakeGithub().on({
      method: 'GET',
      url: installationsUrl,
      reply: () => ({ status: 401, body: { message: 'Bad credentials' } }),
    });

    await expect(
      github.flow().listUserInstallationIds({ accessToken: 'ghu_revoked' }),
    ).rejects.toThrow(GrantRevokedError);
  });
});
