import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  acmeInstallation,
  appConfig,
  FakeGithub,
  installationUrl,
  repositoriesUrl,
} from '#src/__tests__/support/fake-github.ts';

afterEach(() => {
  vi.useRealTimers();
});

describe('GithubConnectFlow getInstallation', () => {
  it('reads the account, selection and repositories', async () => {
    const read = await new FakeGithub()
      .withInstallation()
      .flow()
      .getInstallation({ installationId: '42' });

    expect(read).toEqual({
      provider: 'github',
      externalId: '42',
      url: acmeInstallation.html_url,
      account: {
        provider: 'github',
        externalId: '9919',
        url: 'https://github.com/acme',
        login: 'acme',
        kind: 'organization',
      },
      repositorySelection: 'selected',
      repositories: [
        {
          provider: 'github',
          externalId: '1296269',
          url: 'https://github.com/acme/app',
          fullName: 'acme/app',
          defaultBranch: 'main',
          archived: false,
        },
      ],
      suspended: false,
    });
  });

  it('reads the installation with an App JWT and its repositories with an installation token', async () => {
    const github = new FakeGithub().withInstallation();

    await github.flow().getInstallation({ installationId: '42' });

    const [app] = github.callsTo({ method: 'GET', url: installationUrl });
    const [repositories] = github.callsTo({
      method: 'GET',
      url: repositoriesUrl,
    });
    expect(FakeGithub.jwtIssuer(app?.authorization)).toBe(appConfig.appId);
    expect(repositories?.authorization).toBe('Bearer ghs_installation');
  });
});

describe('GithubConnectFlow isInstallationSuspended', () => {
  it('reads the suspension from the installation record alone, as the App', async () => {
    const github = new FakeGithub().on({
      method: 'GET',
      url: installationUrl,
      reply: () => ({
        body: { ...acmeInstallation, suspended_at: '2026-11-26T12:00:00Z' },
      }),
    });

    expect(
      await github.flow().isInstallationSuspended({ installationId: '42' }),
    ).toBe(true);
    expect(github.calls).toHaveLength(1);
  });

  it('says an installation without a suspension date is not suspended', async () => {
    expect(
      await new FakeGithub()
        .withInstallation()
        .flow()
        .isInstallationSuspended({ installationId: '42' }),
    ).toBe(false);
  });
});
