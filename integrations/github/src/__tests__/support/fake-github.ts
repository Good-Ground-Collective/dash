import { createHmac, generateKeyPairSync } from 'node:crypto';

import { vi } from 'vitest';
import { z } from 'zod';

import type { GithubAppConfig } from '#src/contracts/github-app-config.ts';
import { GithubConnectFlow } from '#src/services/github-connect-flow/github-connect-flow.ts';

export interface RecordedCall {
  method: string;
  url: URL;
  authorization: string | null;
  body: Record<string, string> | null;
}

/** A JSON value GitHub would answer with. */
export type GithubJson =
  | string
  | number
  | boolean
  | null
  | readonly GithubJson[]
  | { readonly [key: string]: GithubJson };

/** A JSON body GitHub would answer with. */
export type GithubBody = { readonly [key: string]: GithubJson };

type Reply = (call: RecordedCall) => { status?: number; body: GithubBody };

const formBodySchema = z.record(z.string(), z.string());
const jwtPayloadSchema = z.object({ iss: z.string() });

/** An RSA key in GitHub's PKCS#1 format, made once per test file. */
export const appPrivateKey = generateKeyPairSync('rsa', {
  modulusLength: 2048,
  privateKeyEncoding: { type: 'pkcs1', format: 'pem' },
  publicKeyEncoding: { type: 'spki', format: 'pem' },
}).privateKey;

export const appConfig: GithubAppConfig = {
  appId: '5947367',
  slug: 'dash-test',
  clientId: 'Iv23-test-client',
  clientSecret: 'test-client-secret',
  privateKey: appPrivateKey,
  webhookSecret: 'test-webhook-secret',
};

export const fixedNow = new Date('2026-11-26T12:00:00Z');
export const tokenUrl = 'https://github.com/login/oauth/access_token';
export const redirectUrl =
  'https://api.example.com/integrations/github/callback';
export const installationUrl = 'https://api.github.com/app/installations/42';
export const repositoriesUrl =
  'https://api.github.com/installation/repositories';

export const octocat = {
  id: 583_231,
  login: 'octocat',
  type: 'User',
  html_url: 'https://github.com/octocat',
  avatar_url: 'https://avatars.githubusercontent.com/u/583231?v=4',
};

export const acmeInstallation = {
  id: 42,
  account: {
    id: 9919,
    login: 'acme',
    type: 'Organization',
    html_url: 'https://github.com/acme',
    avatar_url: 'https://avatars.githubusercontent.com/u/9919?v=4',
  },
  repository_selection: 'selected',
  html_url: 'https://github.com/organizations/acme/settings/installations/42',
  suspended_at: null,
};

export const acmeRepository = {
  id: 1_296_269,
  full_name: 'acme/app',
  html_url: 'https://github.com/acme/app',
  default_branch: 'main',
  archived: false,
};

/** Stands in for github.com and api.github.com behind `@octokit/request`'s `fetch`. Unrouted calls answer 404. */
export class FakeGithub {
  readonly calls: RecordedCall[] = [];
  private readonly routes = new Map<string, Reply>();

  on(props: { method: string; url: string; reply: Reply }): this {
    this.routes.set(`${props.method} ${props.url}`, props.reply);
    return this;
  }

  /** Answers the token endpoint with `body` and `GET /user` with octocat. */
  withUserToken(body: GithubBody): this {
    return this.on({
      method: 'POST',
      url: tokenUrl,
      reply: () => ({ body }),
    }).on({
      method: 'GET',
      url: 'https://api.github.com/user',
      reply: () => ({ body: octocat }),
    });
  }

  /** Installation 42 on the acme organisation, with one repository. */
  withInstallation(): this {
    return this.on({
      method: 'GET',
      url: installationUrl,
      reply: () => ({ body: acmeInstallation }),
    })
      .on({
        method: 'POST',
        url: `${installationUrl}/access_tokens`,
        reply: () => ({
          status: 201,
          body: {
            token: 'ghs_installation',
            expires_at: '2026-11-26T13:00:00Z',
            permissions: { metadata: 'read' },
            repository_selection: 'selected',
          },
        }),
      })
      .on({
        method: 'GET',
        url: repositoriesUrl,
        reply: () => ({
          body: { total_count: 1, repositories: [acmeRepository] },
        }),
      });
  }

  /** A connect flow at `fixedNow`, with this fake standing in for the global `fetch`. The test file restores both after each test. */
  flow(): GithubConnectFlow {
    vi.stubGlobal(
      'fetch',
      async (
        input: string | URL,
        init: RequestInit & { headers?: Record<string, string> },
      ) => this.answer({ input, init }),
    );
    vi.useFakeTimers({ toFake: ['Date'], now: fixedNow });
    return new GithubConnectFlow({ config: appConfig });
  }

  callsTo(props: { method: string; url: string }): RecordedCall[] {
    return this.calls.filter(
      (call) =>
        call.method === props.method &&
        `${call.url.origin}${call.url.pathname}` === props.url,
    );
  }

  private answer(props: {
    input: string | URL;
    init: RequestInit & { headers?: Record<string, string> };
  }): Response {
    const url = new URL(props.input);
    const method = props.init.method ?? 'GET';
    const body = z.string().optional().parse(props.init.body);
    const call: RecordedCall = {
      method,
      url,
      authorization: new Headers(props.init.headers).get('authorization'),
      body: body === undefined ? null : formBodySchema.parse(JSON.parse(body)),
    };
    this.calls.push(call);

    const reply = this.routes.get(`${method} ${url.origin}${url.pathname}`);
    const { status = 200, body: answer } = reply?.(call) ?? {
      status: 404,
      body: { message: 'Not Found' },
    };
    return Response.json(answer, { status });
  }

  /** An HMAC-SHA256 webhook signature, as GitHub sends it. */
  static sign(
    body: string | Uint8Array,
    secret = appConfig.webhookSecret,
  ): string {
    return `sha256=${createHmac('sha256', secret).update(body).digest('hex')}`;
  }

  /** The `iss` claim of the JWT in a `Bearer` header. */
  static jwtIssuer(authorization: string | undefined | null): string {
    const [, payload = ''] = (authorization ?? '').split('.');
    return jwtPayloadSchema.parse(
      JSON.parse(Buffer.from(payload, 'base64url').toString('utf8')),
    ).iss;
  }
}
