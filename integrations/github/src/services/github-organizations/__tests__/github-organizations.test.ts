import { afterEach, describe, expect, it, vi } from 'vitest';

import { GrantRevokedError } from '@dash/integrations-core';

import {
  acmeInstallation,
  FakeGithub,
  octocat,
} from '#src/__tests__/support/fake-github.ts';

const acmeUrl = 'https://api.github.com/users/acme';
const acmeByIdUrl = 'https://api.github.com/user/9919';
const publicOrgsUrl = 'https://api.github.com/users/octocat/orgs';

const acmeProfile = {
  provider: 'github',
  externalId: '9919',
  url: 'https://github.com/acme',
  login: 'acme',
  kind: 'organization',
  avatarUrl: acmeInstallation.account.avatar_url,
};

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe('GithubConnectFlow findOrganization', () => {
  it('reads an organisation by its login with the user token', async () => {
    const github = new FakeGithub().on({
      method: 'GET',
      url: acmeUrl,
      reply: () => ({ body: acmeInstallation.account }),
    });

    const found = await github
      .flow()
      .findOrganization({ accessToken: 'ghu_access', login: 'acme' });

    expect(found).toEqual(acmeProfile);
    expect(github.callsTo({ method: 'GET', url: acmeUrl })[0]).toMatchObject({
      authorization: 'Bearer ghu_access',
    });
  });

  it('finds nothing for a login GitHub doesn’t know', async () => {
    const found = await new FakeGithub()
      .flow()
      .findOrganization({ accessToken: 'ghu_access', login: 'acme' });

    expect(found).toBeNull();
  });

  it('finds nothing for a person’s login', async () => {
    const github = new FakeGithub().on({
      method: 'GET',
      url: 'https://api.github.com/users/octocat',
      reply: () => ({ body: octocat }),
    });

    const found = await github
      .flow()
      .findOrganization({ accessToken: 'ghu_access', login: 'octocat' });

    expect(found).toBeNull();
  });

  it('reports a token GitHub refuses as a revoked grant', async () => {
    const github = new FakeGithub().on({
      method: 'GET',
      url: acmeUrl,
      reply: () => ({ status: 401, body: { message: 'Bad credentials' } }),
    });

    await expect(
      github
        .flow()
        .findOrganization({ accessToken: 'ghu_revoked', login: 'acme' }),
    ).rejects.toThrow(GrantRevokedError);
  });
});

describe('GithubConnectFlow getAccount', () => {
  it('reads an account by its id', async () => {
    const github = new FakeGithub().on({
      method: 'GET',
      url: acmeByIdUrl,
      reply: () => ({ body: acmeInstallation.account }),
    });

    await expect(
      github
        .flow()
        .getAccount({ accessToken: 'ghu_access', externalId: '9919' }),
    ).resolves.toEqual(acmeProfile);
  });

  it('finds nothing for an account that no longer exists', async () => {
    await expect(
      new FakeGithub()
        .flow()
        .getAccount({ accessToken: 'ghu_access', externalId: '9919' }),
    ).resolves.toBeNull();
  });

  it('fails when GitHub fails for another reason', async () => {
    const github = new FakeGithub().on({
      method: 'GET',
      url: acmeByIdUrl,
      reply: () => ({ status: 502, body: { message: 'Bad Gateway' } }),
    });

    await expect(
      github
        .flow()
        .getAccount({ accessToken: 'ghu_access', externalId: '9919' }),
    ).rejects.toMatchObject({ status: 502 });
  });
});

describe('GithubConnectFlow listPublicOrganizations', () => {
  it('lists the public memberships as organisations on github.com', async () => {
    const github = new FakeGithub().on({
      method: 'GET',
      url: publicOrgsUrl,
      reply: () => ({
        body: [
          {
            id: 9919,
            login: 'acme',
            url: 'https://api.github.com/orgs/acme',
            avatar_url: acmeInstallation.account.avatar_url,
          },
        ],
      }),
    });

    const listed = await github
      .flow()
      .listPublicOrganizations({ accessToken: 'ghu_access', login: 'octocat' });

    expect(listed).toEqual([acmeProfile]);
    expect(
      github
        .callsTo({ method: 'GET', url: publicOrgsUrl })[0]
        ?.url.searchParams.get('per_page'),
    ).toBe('100');
  });
});
