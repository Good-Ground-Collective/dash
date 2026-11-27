import type { ConnectFlow } from '@dash/integrations-core';
import type { FastifyReply, FastifyRequest } from 'fastify';
import type { z } from 'zod';

import type { Identity } from '#src/auth/services/identity/identity.ts';
import {
  callbackQuerySchema,
  type ConnectErrorReason,
  type ConnectOutcome,
  connectQuerySchema,
  connectStatusSchema,
  setupQuerySchema,
} from '#src/connections/contracts/connections.ts';
import {
  AccountLinkedElsewhereError,
  AccountNotLinkedError,
  InstallationNotYoursError,
  SignInRequiredError,
} from '#src/connections/errors.ts';
import type { ConnectPaths } from '#src/connections/services/connect-paths/connect-paths.ts';
import type { ConnectState } from '#src/connections/services/connect-state/connect-state.ts';
import type { OwnedConnections } from '#src/connections/services/owned-connections/owned-connections.ts';
import { SignedInPerson } from '#src/connections/services/signed-in-person/signed-in-person.ts';
import type { ZodFastifyInstance } from '#src/platform/contracts/http-module.ts';

/**
 * A provider's connect flow under `/integrations/<provider>`:
 * - `GET /connect`: the install and authorize URLs for the web's “Connect” button, the linked account and the owned connections. Needs a session.
 * - `GET /setup`: the provider's install callback (`installation_id`, and `setup_action` of install, update or request). A request isn't recorded, because the provider doesn't say which account it was for; the account shows up once an owner installs.
 * - `GET /callback`: the OAuth callback, which links the account and finishes an install that was waiting for it.
 *
 * Both callbacks end with a redirect to the web app's `returnTo` path, carrying `connect=<outcome>` and, on failure, `reason`.
 */
export class ConnectRoutes {
  private readonly connections: OwnedConnections;
  private readonly flow: ConnectFlow;
  private readonly person: SignedInPerson;
  private readonly state: ConnectState;
  private readonly paths: ConnectPaths;
  private readonly webOrigin: string;

  constructor(props: {
    connections: OwnedConnections;
    flow: ConnectFlow;
    identity: Pick<Identity, 'session'>;
    state: ConnectState;
    paths: ConnectPaths;
    webOrigin: string;
  }) {
    this.connections = props.connections;
    this.flow = props.flow;
    this.person = new SignedInPerson({ identity: props.identity });
    this.state = props.state;
    this.paths = props.paths;
    this.webOrigin = props.webOrigin;
  }

  register(app: ZodFastifyInstance): void {
    app.get(
      `${this.paths.prefix}/connect`,
      {
        schema: {
          querystring: connectQuerySchema,
          response: { 200: connectStatusSchema },
        },
      },
      async (request) => {
        const userId = await this.person.of(request);
        if (userId === null) {
          throw new SignInRequiredError();
        }
        const returnTo = request.query.returnTo ?? this.paths.defaultReturnTo;
        const base = { userId, provider: this.connections.provider, returnTo };
        return {
          installUrl: this.flow.installUrl({ state: this.state.issue(base) }),
          authorizeUrl: this.flow.authorizeUrl({
            state: this.state.issue(base),
            redirectUrl: this.paths.callbackUrl,
          }),
          account: await this.connections.linkedAccount({ userId }),
          connections: await this.connections.list(),
        };
      },
    );

    app.get(
      `${this.paths.prefix}/setup`,
      { schema: { querystring: setupQuerySchema } },
      async (request, reply) => this.setup({ request, reply }),
    );

    app.get(
      `${this.paths.prefix}/callback`,
      { schema: { querystring: callbackQuerySchema } },
      async (request, reply) => this.callback({ request, reply }),
    );
  }

  private async setup(props: {
    request: FastifyRequest<{ Querystring: z.output<typeof setupQuerySchema> }>;
    reply: FastifyReply;
  }): Promise<FastifyReply> {
    const { request, reply } = props;
    const query = request.query;
    const userId = await this.person.of(request);
    if (userId === null) {
      return this.finish({ reply, outcome: 'error', reason: 'signed-out' });
    }
    const state =
      query.state === undefined
        ? null
        : this.state.read({
            token: query.state,
            userId,
            provider: this.connections.provider,
          });
    const returnTo = state?.returnTo ?? this.paths.defaultReturnTo;

    if (query.setupAction === 'request') {
      return this.finish({ reply, returnTo, outcome: 'requested' });
    }
    if (query.installationId === undefined) {
      return this.finish({
        reply,
        returnTo,
        outcome: 'error',
        reason: 'provider',
      });
    }
    return this.install({
      request,
      reply,
      userId,
      returnTo,
      installationId: query.installationId,
    });
  }

  private async callback(props: {
    request: FastifyRequest<{
      Querystring: z.output<typeof callbackQuerySchema>;
    }>;
    reply: FastifyReply;
  }): Promise<FastifyReply> {
    const { request, reply } = props;
    const query = request.query;
    const userId = await this.person.of(request);
    if (userId === null) {
      return this.finish({ reply, outcome: 'error', reason: 'signed-out' });
    }
    const state =
      query.state === undefined
        ? null
        : this.state.read({
            token: query.state,
            userId,
            provider: this.connections.provider,
          });
    if (state === null) {
      return this.finish({ reply, outcome: 'error', reason: 'state' });
    }
    const { returnTo } = state;
    if (query.error !== undefined || query.code === undefined) {
      return this.finish({
        reply,
        returnTo,
        outcome: 'error',
        reason: 'denied',
      });
    }

    try {
      await this.connections.link({
        userId,
        code: query.code,
        redirectUrl: this.paths.callbackUrl,
      });
    } catch (error) {
      return this.fail({ request, reply, returnTo, error });
    }

    const installationId = state.installationId ?? query.installationId;
    return installationId === undefined
      ? this.finish({ reply, returnTo, outcome: 'linked' })
      : this.install({ request, reply, userId, returnTo, installationId });
  }

  private async install(props: {
    request: FastifyRequest;
    reply: FastifyReply;
    userId: string;
    returnTo: string;
    installationId: string;
  }): Promise<FastifyReply> {
    const { request, reply, userId, returnTo, installationId } = props;
    try {
      await this.connections.recordInstallation({ userId, installationId });
      return this.finish({ reply, returnTo, outcome: 'installed' });
    } catch (error) {
      if (error instanceof AccountNotLinkedError) {
        const state = this.state.issue({
          userId,
          provider: this.connections.provider,
          returnTo,
          installationId,
        });
        return reply.redirect(
          this.flow.authorizeUrl({
            state,
            redirectUrl: this.paths.callbackUrl,
          }),
        );
      }
      return this.fail({ request, reply, returnTo, error });
    }
  }

  /** Logs only the error's name and message: a provider's error object can carry the failed request, secrets included. */
  private fail(props: {
    request: FastifyRequest;
    reply: FastifyReply;
    returnTo: string;
    error: unknown;
  }): FastifyReply {
    const { request, reply, returnTo, error } = props;
    if (error instanceof InstallationNotYoursError) {
      return this.finish({
        reply,
        returnTo,
        outcome: 'error',
        reason: 'not-yours',
      });
    }
    if (error instanceof AccountLinkedElsewhereError) {
      return this.finish({
        reply,
        returnTo,
        outcome: 'error',
        reason: 'linked-elsewhere',
      });
    }
    request.log.error(
      {
        provider: this.connections.provider,
        error:
          error instanceof Error
            ? `${error.name}: ${error.message}`
            : 'unknown',
      },
      'Connecting a provider account failed',
    );
    return this.finish({
      reply,
      returnTo,
      outcome: 'error',
      reason: 'provider',
    });
  }

  private finish(props: {
    reply: FastifyReply;
    returnTo?: string;
    outcome: ConnectOutcome;
    reason?: ConnectErrorReason;
  }): FastifyReply {
    const url = new URL(
      props.returnTo ?? this.paths.defaultReturnTo,
      this.webOrigin,
    );
    url.searchParams.set('connect', props.outcome);
    url.searchParams.set('provider', this.connections.provider);
    if (props.reason !== undefined) {
      url.searchParams.set('reason', props.reason);
    }
    return props.reply.redirect(url.toString());
  }
}
