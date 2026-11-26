import type { FastifyRequest } from 'fastify';

import type { AgentCaller } from '#src/auth/contracts/service-account.ts';
import type { ApiKeyScope } from '#src/auth/definitions/api-key-scopes/api-key-scopes.ts';
import {
  AgentCallerMissingError,
  ApiKeyMissingError,
} from '#src/auth/errors.ts';
import type { Identity } from '#src/auth/services/identity/identity.ts';
import type { ServiceAccounts } from '#src/auth/services/service-accounts/service-accounts.ts';

const bearerPattern = /^Bearer\s+(?<key>\S+)\s*$/iu;

export type AgentRequestHook = (request: FastifyRequest) => Promise<void>;

/** How agent-facing routes authenticate: a service account's API key with the scope the route needs. */
export interface AgentAuthentication {
  /** A Fastify `onRequest` hook that admits only a valid key holding `scope`: 401 without one, 403 without the scope. It runs before body validation, so an unauthenticated caller learns nothing about the route's schema. */
  require(scope: ApiKeyScope): AgentRequestHook;
  /** The caller a `require` hook admitted for this request. */
  caller(request: FastifyRequest): AgentCaller;
}

/** Reads the key from `Authorization: Bearer <key>` or, as the api-key plugin does, `x-api-key`. */
export class ApiKeyAuthentication implements AgentAuthentication {
  private readonly identity: Pick<Identity, 'auth'>;
  private readonly serviceAccounts: ServiceAccounts;
  private readonly callers = new WeakMap<FastifyRequest, AgentCaller>();

  constructor(props: {
    identity: Pick<Identity, 'auth'>;
    serviceAccounts: ServiceAccounts;
  }) {
    this.identity = props.identity;
    this.serviceAccounts = props.serviceAccounts;
  }

  require(scope: ApiKeyScope): AgentRequestHook {
    return async (request) => {
      const key = this.keyOf(request);
      if (key === null) {
        throw new ApiKeyMissingError();
      }

      const caller = await this.serviceAccounts.authenticate({
        context: await this.identity.auth.$context,
        key,
        scope,
      });
      this.callers.set(request, caller);
    };
  }

  caller(request: FastifyRequest): AgentCaller {
    const caller = this.callers.get(request);
    if (caller === undefined) {
      throw new AgentCallerMissingError();
    }
    return caller;
  }

  private keyOf(request: FastifyRequest): string | null {
    const bearer = bearerPattern.exec(request.headers.authorization ?? '')
      ?.groups?.['key'];
    if (bearer !== undefined) {
      return bearer;
    }
    const header = request.headers['x-api-key'];
    const value = Array.isArray(header) ? header[0] : header;
    return value === undefined || value === '' ? null : value;
  }
}
