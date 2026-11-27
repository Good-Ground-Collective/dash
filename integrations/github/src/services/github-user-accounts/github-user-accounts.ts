import {
  type AccountProfile,
  type AccountRole,
  GrantRevokedError,
  type UserAccounts,
  type UserInstallation,
} from '@dash/integrations-core';
import { z } from 'zod';

import { githubProfileSchema } from '#src/contracts/github-account.ts';
import type { GithubRequest } from '#src/contracts/github-request.ts';
import type { GithubInstallations } from '#src/services/github-installations/github-installations.ts';

const pageSize = 100;

/** Installations are read a few at a time, so a person in many organisations doesn't send GitHub the burst its secondary rate limit answers with 403. */
const concurrency = 5;

/** An enterprise has a slug and no login, so it isn't an account Dash can show. Any other account that fails to parse still fails the listing. */
const installationAccountSchema = z.union([
  githubProfileSchema,
  z.object({ slug: z.string().min(1) }).transform(() => null),
]);

const installationPageSchema = z
  .object({
    total_count: z.number(),
    installations: z.array(
      z
        .object({
          id: z.number(),
          account: installationAccountSchema,
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

/** The setup callback's ownership check needs only the ids, so it doesn't depend on the fields the list shows. */
const installationIdPageSchema = z
  .object({
    total_count: z.number(),
    installations: z.array(
      z.object({ id: z.number() }).transform(({ id }) => String(id)),
    ),
  })
  .transform((page) => ({
    totalCount: page.total_count,
    installations: page.installations,
  }));

type ListedInstallation = z.output<
  typeof installationPageSchema
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

/** GitHub answers a rate limit with 403. A primary limit sends `x-ratelimit-remaining: 0` and a secondary one may send `retry-after`, but either may come with only its message, which a refused permission never carries. */
const rateLimitedSchema = z
  .object({
    status: z.literal(403),
    message: z.string(),
    response: z.object({
      headers: z.object({
        'x-ratelimit-remaining': z.string().optional(),
        'retry-after': z.string().optional(),
      }),
    }),
  })
  .refine(
    ({ message, response: { headers } }) =>
      headers['x-ratelimit-remaining'] === '0' ||
      headers['retry-after'] !== undefined ||
      /rate limit/iu.test(message),
  );

type Settled<T> = { failed: false; value: T } | { failed: true; value: null };

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
      Promise.all([
        this.profile(props),
        this.readPages({ ...props, schema: installationPageSchema }),
      ]),
    );

    const shown = listed.flatMap(({ account, ...installation }) =>
      account === null ? [] : [{ ...installation, account }],
    );

    return {
      personal: { ...personal, role: 'personal' },
      installations: await GithubUserAccounts.inBatches({
        items: shown,
        work: async (installation) =>
          this.toUserInstallation({ ...props, personal, installation }),
      }),
    };
  }

  async listInstallationIds(props: {
    accessToken: string;
  }): Promise<readonly string[]> {
    return GithubUserAccounts.asUser(async () =>
      this.readPages({ ...props, schema: installationIdPageSchema }),
    );
  }

  private async profile(props: {
    accessToken: string;
  }): Promise<AccountProfile> {
    const { data } = await this.request('GET /user', {
      headers: GithubUserAccounts.bearer(props),
    });
    return githubProfileSchema.parse(data);
  }

  /** A role or count that fails to load, other than a refused grant, leaves the installation listed and marked `incomplete`. */
  private async toUserInstallation(props: {
    accessToken: string;
    personal: AccountProfile;
    installation: AccountInstallation;
  }): Promise<UserInstallation> {
    const { installation } = props;
    const role = await GithubUserAccounts.settle(async () =>
      this.roleIn(props),
    );
    const repositoryCount = role.failed
      ? role
      : await GithubUserAccounts.settle(async () =>
          this.countFor({ installation, role: role.value }),
        );

    return {
      provider: 'github',
      externalId: installation.id,
      url: installation.htmlUrl,
      account: { ...installation.account, role: role.value },
      repositorySelection: installation.repositorySelection,
      repositoryCount: repositoryCount.value,
      suspended: installation.suspended,
      incomplete: role.failed || repositoryCount.failed,
    };
  }

  /** The count includes private repositories, so only an owner, or the person on their own account, sees it. A suspended installation can't be read. */
  private async countFor(props: {
    installation: AccountInstallation;
    role: AccountRole | null;
  }): Promise<number | null> {
    if (
      props.installation.suspended ||
      (props.role !== 'owner' && props.role !== 'personal')
    ) {
      return null;
    }
    return this.installations.countRepositories({
      installationId: props.installation.id,
    });
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
        const refused =
          status === 404 ||
          (status === 403 && !rateLimitedSchema.safeParse(error).success);
        if (refused) {
          return null;
        }
        throw error;
      }
    });
  }

  private async readPages<T>(props: {
    accessToken: string;
    schema: z.ZodType<{ totalCount: number; installations: T[] }>;
  }): Promise<T[]> {
    const installations: T[] = [];
    for (let page = 1; ; page += 1) {
      const { data } = await this.request('GET /user/installations', {
        headers: GithubUserAccounts.bearer(props),
        per_page: pageSize,
        page,
      });
      const parsed = props.schema.parse(data);
      installations.push(...parsed.installations);

      if (
        parsed.installations.length < pageSize ||
        installations.length >= parsed.totalCount
      ) {
        return installations;
      }
    }
  }

  private static async inBatches<T, R>(props: {
    items: readonly T[];
    work: (item: T) => Promise<R>;
  }): Promise<R[]> {
    const results: R[] = [];
    for (let start = 0; start < props.items.length; start += concurrency) {
      const batch = props.items.slice(start, start + concurrency);
      results.push(...(await Promise.all(batch.map(props.work))));
    }
    return results;
  }

  /** A refused grant still ends the listing: the person must authorize again. */
  private static async settle<T>(work: () => Promise<T>): Promise<Settled<T>> {
    try {
      return { failed: false, value: await work() };
    } catch (error) {
      if (error instanceof GrantRevokedError) {
        throw error;
      }
      return { failed: true, value: null };
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
