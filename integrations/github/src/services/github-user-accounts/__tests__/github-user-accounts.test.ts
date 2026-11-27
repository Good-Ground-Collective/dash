import { afterEach, describe, expect, it, vi } from 'vitest';

import { GrantRevokedError } from '@dash/integrations-core';

import {
  acmeInstallation,
  octocat,
  repositoriesUrl,
} from '#src/__tests__/support/fake-github.ts';
import {
  Accounts,
  enterpriseInstallation,
  installationsUrl,
  membershipUrl,
  personalInstallation,
} from '#src/__tests__/support/fake-user-accounts.ts';

afterEach(() => {
  vi.useRealTimers();
});

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
          incomplete: false,
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

describe('GithubConnectFlow listUserAccounts reads', () => {
  it('reads installations five at a time', async () => {
    const installations = Array.from({ length: 12 }, (_, index) => ({
      ...acmeInstallation,
      id: index + 1,
      suspended_at: '2026-11-20T00:00:00Z',
    }));
    const flow = Accounts.github({ installations }).flow();
    const answer = globalThis.fetch;
    let inFlight = 0;
    let peak = 0;
    vi.stubGlobal('fetch', async (...call: Parameters<typeof fetch>) => {
      inFlight += 1;
      peak = Math.max(peak, inFlight);
      await new Promise((settle) => {
        setTimeout(settle, 1);
      });
      inFlight -= 1;
      return answer(...call);
    });

    const listed = await flow.listUserAccounts({ accessToken: 'ghu_access' });

    expect(listed.installations).toHaveLength(12);
    expect(peak).toBe(5);
  });

  it('leaves a suspended installation’s repositories uncounted', async () => {
    const github = Accounts.github({
      installations: [
        { ...acmeInstallation, suspended_at: '2026-11-20T00:00:00Z' },
      ],
    });

    await expect(Accounts.first(github)).resolves.toMatchObject({
      suspended: true,
      repositoryCount: null,
      incomplete: false,
    });
    expect(github.callsTo({ method: 'GET', url: repositoriesUrl })).toEqual([]);
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

    await expect(Accounts.first(github)).resolves.toMatchObject({
      account: { role: 'personal' },
      repositoryCount: 1,
    });
    expect(github.callsTo({ method: 'GET', url: membershipUrl })).toEqual([]);
  });

  it.each([
    { body: { role: 'admin', state: 'pending' }, role: null },
    { body: { role: 'billing_manager', state: 'active' }, role: null },
  ])('reads $body.role ($body.state) as $role', async ({ body, role }) => {
    const github = Accounts.github({ membership: { body } });

    await expect(Accounts.first(github)).resolves.toMatchObject({
      account: { role },
    });
  });

  it.each([403, 404])(
    'leaves the role unknown when GitHub answers %i for the membership',
    async (status) => {
      const github = Accounts.github({
        membership: { status, body: { message: 'Not Found' } },
      });

      await expect(Accounts.first(github)).resolves.toMatchObject({
        account: { role: null },
        incomplete: false,
      });
    },
  );

  it('shows a member the installation without its repository count', async () => {
    const github = Accounts.github({
      membership: { body: { role: 'member', state: 'active' } },
    });

    await expect(Accounts.first(github)).resolves.toMatchObject({
      account: { role: 'member' },
      repositoryCount: null,
      incomplete: false,
    });
    expect(github.callsTo({ method: 'GET', url: repositoriesUrl })).toEqual([]);
  });
});

describe('GithubConnectFlow listUserAccounts partial failures', () => {
  it.each([{ 'x-ratelimit-remaining': '0' }, { 'retry-after': '60' }])(
    'marks an installation incomplete when the membership read is rate-limited (%o)',
    async (headers) => {
      const github = Accounts.github({
        membership: {
          status: 403,
          headers,
          body: { message: 'You have exceeded a secondary rate limit.' },
        },
      });

      await expect(Accounts.first(github)).resolves.toMatchObject({
        externalId: '42',
        account: { login: 'acme', role: null },
        repositoryCount: null,
        incomplete: true,
      });
    },
  );

  it('keeps the role and marks the installation incomplete when its count fails', async () => {
    const github = Accounts.github().on({
      method: 'GET',
      url: repositoriesUrl,
      reply: () => ({ status: 404, body: { message: 'Not Found' } }),
    });

    await expect(Accounts.first(github)).resolves.toMatchObject({
      account: { role: 'owner' },
      repositoryCount: null,
      incomplete: true,
    });
  });

  it('keeps a refused installation token apart from the user’s grant', async () => {
    const github = Accounts.github().on({
      method: 'GET',
      url: repositoriesUrl,
      reply: () => ({ status: 401, body: { message: 'Bad credentials' } }),
    });

    await expect(Accounts.first(github)).resolves.toMatchObject({
      incomplete: true,
    });
  });
});

describe('GithubConnectFlow listUserAccounts account shapes', () => {
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

  it('fails on an organisation account it cannot read rather than dropping it', async () => {
    const { login: _login, ...withoutLogin } = acmeInstallation.account;
    const github = Accounts.github({
      installations: [{ ...acmeInstallation, account: withoutLogin }],
    });

    await expect(
      github.flow().listUserAccounts({ accessToken: 'ghu_access' }),
    ).rejects.toThrow();
  });

  it('accepts an account without an avatar', async () => {
    const github = Accounts.github({
      installations: [
        {
          ...acmeInstallation,
          account: { ...acmeInstallation.account, avatar_url: null },
        },
      ],
    });

    await expect(Accounts.first(github)).resolves.toMatchObject({
      account: { avatarUrl: null },
    });
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
});
