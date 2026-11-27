import type { AuthorizedUser, UserGrant } from '@dash/integrations-core';
import { z } from 'zod';

import { githubAccountSchema } from '#src/contracts/github-account.ts';
import type { GithubRequest } from '#src/contracts/github-request.ts';
import { GithubOAuthError } from '#src/errors.ts';

const pageSize = 100;
const tokenUrl = 'https://github.com/login/oauth/access_token';

/** GitHub answers 200 with an `error` field when it refuses a token request. */
const tokenResponseSchema = z.union([
  z.object({
    error: z.string(),
    error_description: z.string().optional(),
  }),
  z.object({
    access_token: z.string().min(1),
    expires_in: z.number().optional(),
    refresh_token: z.string().min(1).optional(),
    refresh_token_expires_in: z.number().optional(),
  }),
]);

const userInstallationsSchema = z.object({
  total_count: z.number(),
  installations: z.array(z.object({ id: z.number() })),
});

/**
 * The App's OAuth web flow: a person authorizes the App, and Dash gets a user token that acts
 * as them within what the App may do. Tokens expire when the App's settings say so, and come
 * with a refresh token then.
 */
export class GithubUserAuth {
  private readonly clientId: string;
  private readonly clientSecret: string;
  private readonly request: GithubRequest;
  private readonly now: () => Date;

  constructor(props: {
    clientId: string;
    clientSecret: string;
    request: GithubRequest;
    now: () => Date;
  }) {
    this.clientId = props.clientId;
    this.clientSecret = props.clientSecret;
    this.request = props.request;
    this.now = props.now;
  }

  authorizeUrl(props: { state: string; redirectUrl: string }): string {
    const url = new URL('https://github.com/login/oauth/authorize');
    url.searchParams.set('client_id', this.clientId);
    url.searchParams.set('redirect_uri', props.redirectUrl);
    url.searchParams.set('state', props.state);
    return url.toString();
  }

  async authorizeUser(props: {
    code: string;
    redirectUrl: string;
  }): Promise<AuthorizedUser> {
    const grant = await this.requestToken({
      code: props.code,
      redirect_uri: props.redirectUrl,
    });
    const { data } = await this.request('GET /user', {
      headers: { authorization: `Bearer ${grant.accessToken}` },
    });
    return { account: githubAccountSchema.parse(data), grant };
  }

  async refreshGrant(props: { refreshToken: string }): Promise<UserGrant> {
    return this.requestToken({
      grant_type: 'refresh_token',
      refresh_token: props.refreshToken,
    });
  }

  async listInstallationIds(props: {
    accessToken: string;
  }): Promise<readonly string[]> {
    const ids: string[] = [];
    for (let page = 1; ; page += 1) {
      const { data } = await this.request('GET /user/installations', {
        headers: { authorization: `Bearer ${props.accessToken}` },
        per_page: pageSize,
        page,
      });
      const parsed = userInstallationsSchema.parse(data);
      ids.push(...parsed.installations.map(({ id }) => String(id)));
      if (
        parsed.installations.length < pageSize ||
        ids.length >= parsed.total_count
      ) {
        return ids;
      }
    }
  }

  private async requestToken(
    parameters: Readonly<Record<string, string>>,
  ): Promise<UserGrant> {
    const issuedAt = this.now().getTime();
    const { data } = await this.request(`POST ${tokenUrl}`, {
      headers: { accept: 'application/json' },
      client_id: this.clientId,
      client_secret: this.clientSecret,
      ...parameters,
    });
    const token = tokenResponseSchema.parse(data);
    if ('error' in token) {
      throw new GithubOAuthError({
        code: token.error,
        description: token.error_description,
      });
    }

    const expiry = (seconds: number | undefined) =>
      seconds === undefined
        ? null
        : new Date(issuedAt + seconds * 1000).toISOString();
    return {
      accessToken: token.access_token,
      accessTokenExpiresAt: expiry(token.expires_in),
      refreshToken: token.refresh_token ?? null,
      refreshTokenExpiresAt: expiry(token.refresh_token_expires_in),
    };
  }
}
