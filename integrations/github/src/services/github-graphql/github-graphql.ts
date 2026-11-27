import { createAppAuth } from '@octokit/auth-app';
import { z } from 'zod';

import {
  type GithubGraphqlData,
  githubGraphqlEnvelopeSchema,
  type GithubGraphqlVariables,
} from '#src/contracts/github-activity-response.ts';
import { githubAppConfigSchema } from '#src/contracts/github-app-config.ts';
import type { GithubRequest } from '#src/contracts/github-request.ts';
import { GithubGraphqlError } from '#src/errors.ts';

/** One GraphQL request. Errors whose `type` is in `tolerate`, such as a missing repository, leave the rest of the data usable. */
export type GraphqlCall = (call: {
  query: string;
  variables: GithubGraphqlVariables;
  tolerate?: ReadonlySet<string>;
}) => Promise<GithubGraphqlData>;

export interface GithubGraphql {
  /** Mints an installation token and answers with a call that sends GraphQL under it. */
  forInstallation(installationId: string): Promise<GraphqlCall>;
}

const appGithubGraphqlPropsSchema = githubAppConfigSchema
  .pick({ appId: true, privateKey: true })
  .extend({
    request: z.custom<GithubRequest>((value) => value instanceof Function),
  });

/** GraphQL as the App's installation, so every read is limited to what the account granted the App. */
export class AppGithubGraphql implements GithubGraphql {
  private readonly request: GithubRequest;
  private readonly auth: ReturnType<typeof createAppAuth>;

  constructor(props: z.input<typeof appGithubGraphqlPropsSchema>) {
    const { appId, privateKey, request } =
      appGithubGraphqlPropsSchema.parse(props);
    this.request = request;
    this.auth = createAppAuth({ appId, privateKey, request });
  }

  async forInstallation(installationId: string): Promise<GraphqlCall> {
    const { token } = await this.auth({
      type: 'installation',
      installationId,
    });
    return async (call) => this.send({ token, ...call });
  }

  private async send(props: {
    token: string;
    query: string;
    variables: GithubGraphqlVariables;
    tolerate?: ReadonlySet<string>;
  }): Promise<GithubGraphqlData> {
    const { data } = await this.request('POST /graphql', {
      headers: { authorization: `token ${props.token}` },
      query: props.query,
      variables: props.variables,
    });
    const envelope = githubGraphqlEnvelopeSchema.parse(data);
    const fatal = (envelope.errors ?? []).filter(
      ({ type }) => type === undefined || !props.tolerate?.has(type),
    );
    if (
      envelope.data === null ||
      envelope.data === undefined ||
      fatal.length > 0
    ) {
      throw new GithubGraphqlError({
        messages: fatal.map(({ message }) => message),
      });
    }
    return envelope.data;
  }
}
