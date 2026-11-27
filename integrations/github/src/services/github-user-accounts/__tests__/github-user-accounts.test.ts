import { afterEach, describe, expect, it, vi } from 'vitest';

import { GrantRevokedError } from '@dash/integrations-core';

import {
  acmeInstallation,
  FakeGithub,
  type GithubBody,
  octocat,
  repositoriesUrl,
} from '#src/__tests__/support/fake-github.ts';

afterEach(() => {
  vi.useRealTimers();
});

const userUrl = 'https://api.github.com/user';
const installationsUrl = 'https://api.github.com/user/installations';
const membershipUrl = 'https://api.github.com/user/memberships/orgs/acme';

const personalInstallation = {
  id: 77,
  account: octocat,
  repository_selection: 'all',
  html_url: 'https://github.com/settings/installations/77',
  suspended_at: null,
};

class Accounts {
  /** octocat's token sees `installations`, and its membership in acme answers `membership`. */
  static github(
    props: {
      installations?: readonly GithubBody[];
      membership?: { status?: number; body: GithubBody };
    } = {},
  ): FakeGithub {
    const installations = props.installations ?? [acmeInstallation];
    return new FakeGithub()
      .withInstallation()
      .on({ method: 'GET', url: userUrl, reply: () => ({ body: octocat }) })
      .on({
        method: 'GET',
        url: installationsUrl,
        reply: () => ({
          body: { total_count: installations.length, installations },
        }),
      })
      .on({
        method: 'GET',
        url: membershipUrl,
        reply: () =>
          props.membership ?? { body: { role: 'admin', state: 'active' } },
      });
  }
}

describe('GithubConnectFlow listUserAccounts', () => {
  it('lists the personal account and each installation with the role and repository count', async () => {
    const listed = await Accounts.github()
      .flow()
      .listUserAccounts({ accessToken: 'ghu_access' });

    expect(listed).toEqual({
      personal: {
        provider: 'github',
        externalId: '583231',
        url: 'https://github.com/octocat',
        login: 'octocat',
        kind: 'user',
        avatarUrl: octocat.avatar_url,
        role: 'personal',
      },
      installations: [
        {
          provider: 'github',
          externalId: '42',
          url: acmeInstallation.html_url,
          account: {
            provider: 'github',
            externalId: '9919',
            url: 'https://github.com/acme',
            login: 'acme',
            kind: 'organization',
            avatarUrl: acmeInstallation.account.avatar_url,
            role: 'owner',
          },
          repositorySelection: 'selected',
          repositoryCount: 1,
          suspended: false,
        },
      ],
    });
  });

  it('reads the role with the user token and counts repositories with an installation token', async () => {
    const github = Accounts.github();

    await github.flow().listUserAccounts({ accessToken: 'ghu_access' });

    const [membership] = github.callsTo({ method: 'GET', url: membershipUrl });
    const [count] = github.callsTo({ method: 'GET', url: repositoriesUrl });
    expect(membership?.authorization).toBe('Bearer ghu_access');
    expect(count?.authorization).toBe('Bearer ghs_installation');
    expect(count?.url.searchParams.get('per_page')).toBe('1');
  });
});

describe('GithubConnectFlow listUserAccounts roles', () => {
  it('marks the installation on the personal account as personal without asking for a membership', async () => {
    const github = Accounts.github({
      installations: [personalInstallation],
    }).on({
      method: 'POST',
      url: 'https://api.github.com/app/installations/77/access_tokens',
      reply: () => ({
        status: 201,
        body: { token: 'ghs_personal', expires_at: '2026-11-26T13:00:00Z' },
      }),
    });

    const listed = await github
      .flow()
      .listUserAccounts({ accessToken: 'ghu_access' });

    expect(listed.installations[0]?.account.role).toBe('personal');
    expect(github.callsTo({ method: 'GET', url: membershipUrl })).toEqual([]);
  });

  it.each([
    { body: { role: 'member', state: 'active' }, role: 'member' },
    { body: { role: 'admin', state: 'pending' }, role: null },
    { body: { role: 'billing_manager', state: 'active' }, role: null },
  ])('reads $body.role ($body.state) as $role', async ({ body, role }) => {
    const listed = await Accounts.github({ membership: { body } })
      .flow()
      .listUserAccounts({ accessToken: 'ghu_access' });

    expect(listed.installations[0]?.account.role).toBe(role);
  });

  it.each([403, 404])(
    'leaves the role unknown when GitHub answers %i for the membership',
    async (status) => {
      const listed = await Accounts.github({
        membership: { status, body: { message: 'Not Found' } },
      })
        .flow()
        .listUserAccounts({ accessToken: 'ghu_access' });

      expect(listed.installations[0]?.account.role).toBeNull();
    },
  );

  it('leaves a suspended installation’s repositories uncounted', async () => {
    const github = Accounts.github({
      installations: [
        { ...acmeInstallation, suspended_at: '2026-11-20T00:00:00Z' },
      ],
    });

    const listed = await github
      .flow()
      .listUserAccounts({ accessToken: 'ghu_access' });

    expect(listed.installations[0]).toMatchObject({
      suspended: true,
      repositoryCount: null,
    });
    expect(github.callsTo({ method: 'GET', url: repositoriesUrl })).toEqual([]);
  });
});

describe('GithubConnectFlow enterprise installations', () => {
  const enterpriseInstallation = {
    ...acmeInstallation,
    id: 88,
    account: {
      id: 31,
      slug: 'acme-enterprise',
      name: 'Acme Enterprise',
      html_url: 'https://github.com/enterprises/acme-enterprise',
      avatar_url: 'https://avatars.githubusercontent.com/b/31?v=4',
    },
  };

  it('leaves out an installation on an enterprise, which is not an account', async () => {
    const listed = await Accounts.github({
      installations: [acmeInstallation, enterpriseInstallation],
    })
      .flow()
      .listUserAccounts({ accessToken: 'ghu_access' });

    expect(listed.installations.map(({ externalId }) => externalId)).toEqual([
      '42',
    ]);
  });

  it('still counts it among the installations the user can manage', async () => {
    const ids = await Accounts.github({
      installations: [acmeInstallation, enterpriseInstallation],
    })
      .flow()
      .listUserInstallationIds({ accessToken: 'ghu_access' });

    expect(ids).toEqual(['42', '88']);
  });
});

describe('GithubConnectFlow listUserAccounts refusals', () => {
  it('reports a token GitHub refuses as a revoked grant', async () => {
    const github = Accounts.github().on({
      method: 'GET',
      url: installationsUrl,
      reply: () => ({ status: 401, body: { message: 'Bad credentials' } }),
    });

    await expect(
      github.flow().listUserAccounts({ accessToken: 'ghu_revoked' }),
    ).rejects.toThrow(GrantRevokedError);
  });

  it('reports a membership read GitHub refuses as a revoked grant', async () => {
    const github = Accounts.github({
      membership: { status: 401, body: { message: 'Bad credentials' } },
    });

    await expect(
      github.flow().listUserAccounts({ accessToken: 'ghu_revoked' }),
    ).rejects.toThrow(GrantRevokedError);
  });

  it('keeps a refused installation token apart from the user’s grant', async () => {
    const github = Accounts.github().on({
      method: 'GET',
      url: repositoriesUrl,
      reply: () => ({ status: 401, body: { message: 'Bad credentials' } }),
    });

    const listing = github
      .flow()
      .listUserAccounts({ accessToken: 'ghu_access' });

    await expect(listing).rejects.toThrow();
    await expect(listing).rejects.not.toThrow(GrantRevokedError);
  });
});

describe('GithubConnectFlow listUserInstallationIds', () => {
  it('lists every installation the user can manage, across pages', async () => {
    const ids = Array.from({ length: 101 }, (_, index) => index + 1);
    const github = new FakeGithub().on({
      method: 'GET',
      url: installationsUrl,
      reply: ({ url }) => {
        const page = Number(url.searchParams.get('page'));
        const installations = ids
          .slice((page - 1) * 100, page * 100)
          .map((id) => ({ ...acmeInstallation, id }));
        return { body: { total_count: ids.length, installations } };
      },
    });

    const listed = await github
      .flow()
      .listUserInstallationIds({ accessToken: 'ghu_access' });

    expect(listed).toEqual(ids.map(String));
    expect(github.calls).toHaveLength(2);
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

describe('GithubConnectFlow getAccount', () => {
  const accountUrl = 'https://api.github.com/user/9919';

  it('reads an organisation by id as the user', async () => {
    const github = new FakeGithub().on({
      method: 'GET',
      url: accountUrl,
      reply: () => ({ body: acmeInstallation.account }),
    });

    await expect(
      github
        .flow()
        .getAccount({ accessToken: 'ghu_access', accountExternalId: '9919' }),
    ).resolves.toEqual({
      provider: 'github',
      externalId: '9919',
      url: 'https://github.com/acme',
      login: 'acme',
      kind: 'organization',
      avatarUrl: acmeInstallation.account.avatar_url,
    });
    expect(github.calls[0]?.authorization).toBe('Bearer ghu_access');
  });

  it('answers null for an account that no longer exists', async () => {
    await expect(
      new FakeGithub()
        .flow()
        .getAccount({ accessToken: 'ghu_access', accountExternalId: '9919' }),
    ).resolves.toBeNull();
  });

  it('reports a token GitHub refuses as a revoked grant', async () => {
    const github = new FakeGithub().on({
      method: 'GET',
      url: accountUrl,
      reply: () => ({ status: 401, body: { message: 'Bad credentials' } }),
    });

    await expect(
      github
        .flow()
        .getAccount({ accessToken: 'ghu_revoked', accountExternalId: '9919' }),
    ).rejects.toThrow(GrantRevokedError);
  });
});
