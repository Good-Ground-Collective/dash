import { describe, expect, it } from 'vitest';

import {
  acmeInstallation,
  appConfig,
  FakeGithub,
  installationUrl,
  repositoriesUrl,
} from '#src/__tests__/support/fake-github.ts';

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
