import { request } from '@octokit/request';
import { z } from 'zod';

import { ActivityNodes } from '#src/__tests__/support/activity-nodes.ts';
import {
  appConfig,
  type GithubJson,
} from '#src/__tests__/support/fake-github.ts';
import type { GithubAppConfig } from '#src/contracts/github-app-config.ts';
import type { GithubRequest } from '#src/contracts/github-request.ts';
import { GithubActivityFeed } from '#src/services/github-activity-feed/github-activity-feed.ts';
import { GithubTaskTracker } from '#src/services/github-task-tracker/github-task-tracker.ts';

export type GraphqlVariables = Record<string, string | number | boolean | null>;

export interface GraphqlCall {
  operation: string;
  variables: GraphqlVariables;
  authorization: string | null;
}

type GraphqlReply = (call: GraphqlCall) => GithubJson;

const graphqlBodySchema = z.object({
  query: z.string(),
  variables: z.record(
    z.string(),
    z.union([z.string(), z.number(), z.boolean(), z.null()]),
  ),
});

const graphqlRequestBodySchema = z
  .string()
  .transform((text, context) => {
    try {
      return JSON.parse(text);
    } catch {
      context.addIssue({ code: 'custom', message: 'Expected a JSON body' });
      return z.NEVER;
    }
  })
  .pipe(graphqlBodySchema);

/**
 * Stands in for api.github.com behind an injected `@octokit/request`: mints installation
 * tokens and answers GraphQL by operation name. Unrouted operations answer with an error.
 */
export class FakeGithubGraphql {
  readonly calls: GraphqlCall[] = [];
  readonly tokenRequests: string[] = [];
  readonly documents = new Map<string, string>();
  private readonly operations = new Map<string, GraphqlReply>();

  on(props: { operation: string; reply: GraphqlReply }): this {
    this.operations.set(props.operation, props.reply);
    return this;
  }

  /** Empty searches, and every repository asked for exists with no failed runs and no releases. */
  withEmptyActivity(): this {
    return this.on({
      operation: 'DashActivity',
      reply: () => ({
        data: {
          review: ActivityNodes.page({ nodes: [] }),
          authored: ActivityNodes.page({ nodes: [] }),
          assigned: ActivityNodes.page({ nodes: [] }),
          merged: ActivityNodes.page({ nodes: [] }),
        },
      }),
    })
      .on({
        operation: 'DashDefaultBranches',
        reply: ({ variables }) => ({
          data: FakeGithubGraphql.repositories(variables, (fullName) =>
            ActivityNodes.defaultBranchNode({ fullName }),
          ),
        }),
      })
      .on({
        operation: 'DashReleases',
        reply: ({ variables }) => ({
          data: FakeGithubGraphql.repositories(variables, (fullName) =>
            ActivityNodes.releasesNode({ fullName }),
          ),
        }),
      });
  }

  feed(
    credentials: Partial<Pick<GithubAppConfig, 'appId' | 'privateKey'>> = {},
  ): GithubActivityFeed {
    return new GithubActivityFeed({
      appId: appConfig.appId,
      privateKey: appConfig.privateKey,
      ...credentials,
      request: this.request(),
    });
  }

  tracker(): GithubTaskTracker {
    return new GithubTaskTracker({
      appId: appConfig.appId,
      privateKey: appConfig.privateKey,
      request: this.request(),
    });
  }

  request(): GithubRequest {
    return request.defaults({
      headers: { 'user-agent': 'dash-test' },
      request: {
        fetch: async (input: string | URL, init: RequestInit) =>
          this.answer({ url: new URL(input), init }),
      },
    });
  }

  callsTo(operation: string): GraphqlCall[] {
    return this.calls.filter((call) => call.operation === operation);
  }

  private answer(props: { url: URL; init: RequestInit }): Response {
    const { url, init } = props;
    if (url.pathname.endsWith('/access_tokens')) {
      this.tokenRequests.push(url.pathname);
      return Response.json(
        {
          token: 'ghs_installation',
          expires_at: '2099-01-01T00:00:00Z',
          permissions: { metadata: 'read' },
          repository_selection: 'selected',
        },
        { status: 201 },
      );
    }

    const body = graphqlRequestBodySchema.parse(init.body);
    const operation =
      /query (?<name>\w+)/u.exec(body.query)?.groups?.['name'] ?? '';
    const call: GraphqlCall = {
      operation,
      variables: body.variables,
      authorization: new Headers(init.headers).get('authorization'),
    };
    this.calls.push(call);
    this.documents.set(operation, body.query);

    const reply = this.operations.get(operation);
    return Response.json(
      reply === undefined
        ? { data: null, errors: [{ message: `No route for ${operation}` }] }
        : reply(call),
    );
  }

  private static repositories(
    variables: GraphqlVariables,
    node: (fullName: string) => GithubJson,
  ): GithubJson {
    return Object.fromEntries(
      Object.keys(variables)
        .filter((key) => key.startsWith('owner'))
        .map((key) => {
          const index = key.slice('owner'.length);
          const fullName = `${String(variables[key])}/${String(variables[`name${index}`])}`;
          return [`repository${index}`, node(fullName)];
        }),
    );
  }
}
