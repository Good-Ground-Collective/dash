import type { AccountProfile } from '@dash/integrations-core';
import { z } from 'zod';

import { githubProfileSchema } from '#src/contracts/github-account.ts';
import type { GithubRequest } from '#src/contracts/github-request.ts';
import {
  githubErrorStatusSchema,
  GithubUserToken,
} from '#src/services/github-user-token/github-user-token.ts';

/** GitHub lists at most this many public memberships in one page, and Dash reads only the first. */
const pageSize = 100;

/** `GET /users/{username}/orgs` gives no profile URL or type: every entry is an organisation at `github.com/<login>`. */
const publicOrganizationsSchema = z.array(
  z
    .object({
      id: z.number(),
      login: z.string().min(1),
      avatar_url: z.url().nullable(),
    })
    .transform((organization): AccountProfile => ({
      provider: 'github',
      externalId: String(organization.id),
      url: `https://github.com/${organization.login}`,
      login: organization.login,
      kind: 'organization',
      avatarUrl: organization.avatar_url,
    })),
);

const githubOrganizationsPropsSchema = z.object({
  request: z.custom<GithubRequest>((value) => value instanceof Function),
});

/**
 * Organisations as a person's user token sees their public profiles. A GitHub App user token
 * can't list the organisations a person belongs to where the App isn't installed, so these
 * reads find one by name or id, or list only the memberships the person made public.
 */
export class GithubOrganizations {
  private readonly request: GithubRequest;

  constructor(props: z.input<typeof githubOrganizationsPropsSchema>) {
    this.request = githubOrganizationsPropsSchema.parse(props).request;
  }

  /** Null when no organisation has that login, including when it names a person. */
  async findByLogin(props: {
    accessToken: string;
    login: string;
  }): Promise<AccountProfile | null> {
    const profile = await this.readProfile(async () =>
      this.request('GET /users/{username}', {
        headers: GithubUserToken.bearer(props),
        username: props.login,
      }),
    );
    return profile?.kind === 'organization' ? profile : null;
  }

  /** Null when no account has that id any more. */
  async getAccount(props: {
    accessToken: string;
    externalId: string;
  }): Promise<AccountProfile | null> {
    return this.readProfile(async () =>
      this.request('GET /user/{account_id}', {
        headers: GithubUserToken.bearer(props),
        account_id: Number(props.externalId),
      }),
    );
  }

  async listPublic(props: {
    accessToken: string;
    login: string;
  }): Promise<AccountProfile[]> {
    const { data } = await GithubUserToken.call(async () =>
      this.request('GET /users/{username}/orgs', {
        headers: GithubUserToken.bearer(props),
        username: props.login,
        per_page: pageSize,
      }),
    );
    return publicOrganizationsSchema.parse(data);
  }

  private async readProfile(
    read: () => Promise<{ data: unknown }>,
  ): Promise<AccountProfile | null> {
    try {
      const { data } = await GithubUserToken.call(read);
      return githubProfileSchema.parse(data);
    } catch (error) {
      if (githubErrorStatusSchema.safeParse(error).data?.status === 404) {
        return null;
      }
      throw error;
    }
  }
}
