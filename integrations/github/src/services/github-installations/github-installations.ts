import type { Installation, Repository } from '@dash/integrations-core';
import { createAppAuth } from '@octokit/auth-app';
import { z } from 'zod';

import { githubAccountSchema } from '#src/contracts/github-account.ts';
import type { GithubRequest } from '#src/contracts/github-request.ts';

const pageSize = 100;

const installationResponseSchema = z
  .object({
    id: z.number(),
    account: githubAccountSchema,
    repository_selection: z.enum(['all', 'selected']),
    html_url: z.url(),
    suspended_at: z.string().nullable(),
  })
  .transform((installation) => ({
    id: installation.id,
    account: installation.account,
    repositorySelection: installation.repository_selection,
    htmlUrl: installation.html_url,
    suspendedAt: installation.suspended_at,
  }));

const installationRepositoriesSchema = z
  .object({
    total_count: z.number(),
    repositories: z.array(
      z
        .object({
          id: z.number(),
          full_name: z.string(),
          html_url: z.url(),
          default_branch: z.string(),
          archived: z.boolean(),
        })
        .transform((repository): Repository => ({
          provider: 'github',
          externalId: String(repository.id),
          url: repository.html_url,
          fullName: repository.full_name,
          defaultBranch: repository.default_branch,
          archived: repository.archived,
        })),
    ),
  })
  .transform((page) => ({
    totalCount: page.total_count,
    repositories: page.repositories,
  }));

/**
 * Installations of the App, read as the App. `@octokit/auth-app` mints the App JWTs and the
 * installation tokens, and caches each installation token until shortly before it expires.
 */
export class GithubInstallations {
  private readonly slug: string;
  private readonly request: GithubRequest;
  private readonly auth: ReturnType<typeof createAppAuth>;

  constructor(props: {
    appId: string;
    slug: string;
    privateKey: string;
    request: GithubRequest;
  }) {
    this.slug = props.slug;
    this.request = props.request;
    this.auth = createAppAuth({
      appId: props.appId,
      privateKey: props.privateKey,
      request: props.request,
    });
  }

  installUrl(props: { state: string; targetAccountId?: string }): string {
    const base = `https://github.com/apps/${this.slug}/installations/new`;
    if (props.targetAccountId === undefined) {
      const url = new URL(base);
      url.searchParams.set('state', props.state);
      return url.toString();
    }
    const url = new URL(`${base}/permissions`);
    url.searchParams.set('target_id', props.targetAccountId);
    url.searchParams.set('state', props.state);
    return url.toString();
  }

  async get(props: { installationId: string }): Promise<Installation> {
    const app = await this.auth({ type: 'app' });
    const { data } = await this.request(
      'GET /app/installations/{installation_id}',
      {
        headers: { authorization: `Bearer ${app.token}` },
        installation_id: Number(props.installationId),
      },
    );
    const installation = installationResponseSchema.parse(data);

    return {
      provider: 'github',
      externalId: String(installation.id),
      url: installation.htmlUrl,
      account: installation.account,
      repositorySelection: installation.repositorySelection,
      repositories: await this.listRepositories(props),
      suspended: installation.suspendedAt !== null,
    };
  }

  /** How many repositories the installation covers, from one page of one. */
  async countRepositories(props: { installationId: string }): Promise<number> {
    const { data } = await this.request('GET /installation/repositories', {
      headers: { authorization: `Bearer ${await this.tokenFor(props)}` },
      per_page: 1,
    });
    return installationRepositoriesSchema.parse(data).totalCount;
  }

  /** Every repository the installation covers, read with an installation token. */
  async listRepositories(props: {
    installationId: string;
  }): Promise<Repository[]> {
    const token = await this.tokenFor(props);
    const repositories: Repository[] = [];
    for (let page = 1; ; page += 1) {
      const { data } = await this.request('GET /installation/repositories', {
        headers: { authorization: `Bearer ${token}` },
        per_page: pageSize,
        page,
      });
      const parsed = installationRepositoriesSchema.parse(data);
      repositories.push(...parsed.repositories);
      if (
        parsed.repositories.length < pageSize ||
        repositories.length >= parsed.totalCount
      ) {
        return repositories;
      }
    }
  }

  private async tokenFor(props: { installationId: string }): Promise<string> {
    const { token } = await this.auth({
      type: 'installation',
      installationId: props.installationId,
    });
    return token;
  }
}
