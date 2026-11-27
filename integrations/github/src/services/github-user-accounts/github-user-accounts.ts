import {
  type AccountProfile,
  type AccountRole,
  GrantRevokedError,
  type UserAccount,
  type UserAccounts,
  type UserInstallation,
} from '@dash/integrations-core';
import { z } from 'zod';

import { githubProfileSchema } from '#src/contracts/github-account.ts';
import type { GithubRequest } from '#src/contracts/github-request.ts';
import type { GithubInstallations } from '#src/services/github-installations/github-installations.ts';

const pageSize = 100;

/** An enterprise installation's account has no login or type, so it isn't an account Dash can show. */
const userInstallationsSchema = z
  .object({
    total_count: z.number(),
    installations: z.array(
      z
        .object({
          id: z.number(),
          account: githubProfileSchema.nullable().catch(null),
          repository_selection: z.enum(['all', 'selected']),
          html_url: z.url(),
          suspended_at: z.string().nullable(),
        })
        .transform((installation) => ({
          id: String(installation.id),
          account: installation.account,
          repositorySelection: installation.repository_selection,
          htmlUrl: installation.html_url,
          suspended: installation.suspended_at !== null,
        })),
    ),
  })
  .transform((page) => ({
    totalCount: page.total_count,
    installations: page.installations,
  }));

type ListedInstallation = z.output<
  typeof userInstallationsSchema
>['installations'][number];

type AccountInstallation = ListedInstallation & { account: AccountProfile };

/** Only an active `admin` is an owner. A pending invitation or a billing manager has no role Dash shows. */
const membershipSchema = z
  .object({ role: z.string(), state: z.string() })
  .transform(({ role, state }): AccountRole | null => {
    if (state !== 'active') {
      return null;
    }
    if (role === 'admin') {
      return 'owner';
    }
    return role === 'member' ? 'member' : null;
  });

/** How `@octokit/request` reports an HTTP error. */
const statusSchema = z.object({ status: z.number() });

/**
 * The accounts a person's user token can see. A GitHub App user token only reaches accounts
 * where the App is installed, so `/user/installations` is the whole list of organisations it
 * can show: see octokit/octokit.js#2139.
 */
export class GithubUserAccounts {
  private readonly request: GithubRequest;
  private readonly installations: GithubInstallations;

  constructor(props: {
    request: GithubRequest;
    installations: GithubInstallations;
  }) {
    this.request = props.request;
    this.installations = props.installations;
  }

  async list(props: { accessToken: string }): Promise<UserAccounts> {
    const [personal, listed] = await GithubUserAccounts.asUser(async () =>
      Promise.all([this.profile(props), this.readInstallations(props)]),
    );
    return {
      personal: { ...personal, role: 'personal' },
      installations: await Promise.all(
        listed.flatMap(({ account, ...installation }) =>
          account === null
            ? []
            : [
                this.describe({
                  ...props,
                  personal,
                  installation: { ...installation, account },
                }),
              ],
        ),
      ),
    };
  }

  async listInstallationIds(props: {
    accessToken: string;
  }): Promise<readonly string[]> {
    return GithubUserAccounts.asUser(async () =>
      (await this.readInstallations(props)).map(({ id }) => id),
    );
  }

  /** `GET /user/{account_id}` answers for organisations as well as users. */
  async get(props: {
    accessToken: string;
    accountExternalId: string;
  }): Promise<AccountProfile | null> {
    return GithubUserAccounts.asUser(async () => {
      try {
        const { data } = await this.request('GET /user/{account_id}', {
          headers: GithubUserAccounts.bearer(props),
          account_id: Number(props.accountExternalId),
        });
        return githubProfileSchema.parse(data);
      } catch (error) {
        if (statusSchema.safeParse(error).data?.status === 404) {
          return null;
        }
        throw error;
      }
    });
  }

  private async profile(props: {
    accessToken: string;
  }): Promise<AccountProfile> {
    const { data } = await this.request('GET /user', {
      headers: GithubUserAccounts.bearer(props),
    });
    return githubProfileSchema.parse(data);
  }

  private async describe(props: {
    accessToken: string;
    personal: AccountProfile;
    installation: AccountInstallation;
  }): Promise<UserInstallation> {
    const { installation } = props;
    const [role, repositoryCount] = await Promise.all([
      this.roleIn(props),
      installation.suspended
        ? null
        : this.installations.countRepositories({
            installationId: installation.id,
          }),
    ]);
    const account: UserAccount = { ...installation.account, role };
    return {
      provider: 'github',
      externalId: installation.id,
      url: installation.htmlUrl,
      account,
      repositorySelection: installation.repositorySelection,
      repositoryCount,
      suspended: installation.suspended,
    };
  }

  /** The App's `members: read` lets the user token read its own membership where the App is installed. GitHub answers 403 or 404 when it won't say. */
  private async roleIn(props: {
    accessToken: string;
    personal: AccountProfile;
    installation: AccountInstallation;
  }): Promise<AccountRole | null> {
    const { account } = props.installation;
    if (account.kind === 'user') {
      return account.externalId === props.personal.externalId
        ? 'personal'
        : null;
    }
    return GithubUserAccounts.asUser(async () => {
      try {
        const { data } = await this.request(
          'GET /user/memberships/orgs/{org}',
          { headers: GithubUserAccounts.bearer(props), org: account.login },
        );
        return membershipSchema.parse(data);
      } catch (error) {
        const status = statusSchema.safeParse(error).data?.status;
        if (status === 403 || status === 404) {
          return null;
        }
        throw error;
      }
    });
  }

  private async readInstallations(props: {
    accessToken: string;
  }): Promise<ListedInstallation[]> {
    const installations: ListedInstallation[] = [];
    for (let page = 1; ; page += 1) {
      const { data } = await this.request('GET /user/installations', {
        headers: GithubUserAccounts.bearer(props),
        per_page: pageSize,
        page,
      });
      const parsed = userInstallationsSchema.parse(data);
      installations.push(...parsed.installations);
      if (
        parsed.installations.length < pageSize ||
        installations.length >= parsed.totalCount
      ) {
        return installations;
      }
    }
  }

  /** GitHub answers 401 to a user token that was revoked or has expired. Only calls made with the user token go through here. */
  private static async asUser<T>(work: () => Promise<T>): Promise<T> {
    try {
      return await work();
    } catch (error) {
      if (statusSchema.safeParse(error).data?.status === 401) {
        throw new GrantRevokedError({ provider: 'github', cause: error });
      }
      throw error;
    }
  }

  private static bearer(props: { accessToken: string }) {
    return { authorization: `Bearer ${props.accessToken}` };
  }
}
