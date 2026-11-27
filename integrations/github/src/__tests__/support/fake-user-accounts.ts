import {
  acmeInstallation,
  FakeGithub,
  type GithubBody,
  octocat,
} from '#src/__tests__/support/fake-github.ts';

export const userUrl = 'https://api.github.com/user';
export const installationsUrl = 'https://api.github.com/user/installations';
export const membershipUrl =
  'https://api.github.com/user/memberships/orgs/acme';

export const personalInstallation = {
  id: 77,
  account: octocat,
  repository_selection: 'all',
  html_url: 'https://github.com/settings/installations/77',
  suspended_at: null,
};

export const enterpriseInstallation = {
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

type Answer = {
  status?: number;
  headers?: Record<string, string>;
  body: GithubBody;
};

/** A GitHub that answers octocat's account listing. */
export class Accounts {
  /** octocat's token sees `installations`, and its membership in acme answers `membership`. */
  static github(
    props: { installations?: readonly GithubBody[]; membership?: Answer } = {},
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

  static async first(github: FakeGithub) {
    const listed = await github
      .flow()
      .listUserAccounts({ accessToken: 'ghu_access' });
    return listed.installations[0];
  }
}
