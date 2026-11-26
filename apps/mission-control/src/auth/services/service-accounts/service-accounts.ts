import type { AuthContext } from 'better-auth';

import type { ServicePrincipal } from '#src/auth/contracts/principal.ts';
import {
  type AgentCaller,
  type ApiKeySummary,
  type CreatedServiceAccount,
  type IssuedApiKey,
  type NewApiKey,
  newApiKeySchema,
  type NewServiceAccount,
  newServiceAccountSchema,
  type ServiceAccount,
  type ServiceAccountKind,
  type ServiceAccountList,
} from '#src/auth/contracts/service-account.ts';
import type { ApiKeyScope } from '#src/auth/definitions/api-key-scopes/api-key-scopes.ts';
import {
  ApiKeyNotFoundError,
  ApiKeyRejectedError,
  ApiKeyScopeError,
  ServiceAccountNotCreatedError,
  ServiceAccountNotFoundError,
} from '#src/auth/errors.ts';
import type { ApiKeys } from '#src/auth/services/api-keys/api-keys.ts';
import type { ServicePrincipals } from '#src/auth/services/service-principals/service-principals.ts';

const daySeconds = 60 * 60 * 24;

/** How long each kind's keys live. Bench keys never expire. Agent keys run away from a bench, such as in CI, so they expire and get rotated. */
const keyLifetimeSeconds = {
  bench: null,
  agent: 90 * daySeconds,
} as const satisfies Record<ServiceAccountKind, number | null>;

/** A person's service accounts and their keys. Another person's account or key is reported as not found. */
export interface ServiceAccounts {
  /** The person's accounts with their keys, oldest first. */
  list(props: {
    context: AuthContext;
    ownerUserId: string;
  }): Promise<ServiceAccountList>;
  /** Creates an account and issues its first key, or neither. */
  create(props: {
    context: AuthContext;
    ownerUserId: string;
    input: NewServiceAccount;
  }): Promise<CreatedServiceAccount>;
  /** Issues another key to an account, such as to rotate one. It gets the scopes chosen when the account was created, never more. */
  issueKey(props: {
    context: AuthContext;
    ownerUserId: string;
    input: NewApiKey;
  }): Promise<IssuedApiKey>;
  /** Deletes the account and every key it holds. */
  revokeAccount(props: {
    context: AuthContext;
    ownerUserId: string;
    serviceAccountId: string;
  }): Promise<void>;
  /** Deletes one key. Another person's key answers `ApiKeyNotFoundError`, as if it didn't exist. */
  revokeKey(props: {
    context: AuthContext;
    ownerUserId: string;
    keyId: string;
  }): Promise<void>;
  /** The caller behind an API key that holds `scope`. Rejects with `ApiKeyRejectedError` or `ApiKeyScopeError`. */
  authenticate(props: {
    context: AuthContext;
    key: string;
    scope: ApiKeyScope;
  }): Promise<AgentCaller>;
}

/** Service accounts are `service` principals with API keys. Revoking deletes, so the next request with the key fails. */
export class OwnedServiceAccounts implements ServiceAccounts {
  private readonly servicePrincipals: ServicePrincipals;
  private readonly apiKeys: ApiKeys;

  constructor(props: {
    servicePrincipals: ServicePrincipals;
    apiKeys: ApiKeys;
  }) {
    this.servicePrincipals = props.servicePrincipals;
    this.apiKeys = props.apiKeys;
  }

  async authenticate(props: {
    context: AuthContext;
    key: string;
    scope: ApiKeyScope;
  }): Promise<AgentCaller> {
    const key = await this.apiKeys.verify(props);
    const principal =
      key === null
        ? null
        : await this.servicePrincipals.find({ id: key.principalId });
    if (key === null || principal === null) {
      throw new ApiKeyRejectedError();
    }
    if (!key.scopes.includes(props.scope)) {
      throw new ApiKeyScopeError({ scope: props.scope });
    }

    return {
      principalId: principal.id,
      keyId: key.id,
      scopes: key.scopes,
      account: this.callerAccount(principal),
    };
  }

  async list(props: {
    context: AuthContext;
    ownerUserId: string;
  }): Promise<ServiceAccountList> {
    const principals = await this.servicePrincipals.listOwnedBy({
      ownerUserId: props.ownerUserId,
    });
    const keys = await this.apiKeys.listFor({
      context: props.context,
      principalIds: principals.map((principal) => principal.id),
    });
    return {
      serviceAccounts: principals.map((principal) =>
        this.toAccount({ principal, keys: keys.get(principal.id) ?? [] }),
      ),
    };
  }

  async create(props: {
    context: AuthContext;
    ownerUserId: string;
    input: NewServiceAccount;
  }): Promise<CreatedServiceAccount> {
    const input = newServiceAccountSchema.parse(props.input);
    const principal = await this.servicePrincipals.create({
      name: input.name,
      ownerUserId: props.ownerUserId,
      description: input.description,
      scopes: input.scopes,
      benchId: input.kind === 'bench' ? input.benchId : undefined,
      agentName: input.kind === 'agent' ? input.agentName : undefined,
    });

    try {
      const apiKey = await this.apiKeys.issue({
        context: props.context,
        principalId: principal.id,
        scopes: principal.scopes,
        lifetimeSeconds: keyLifetimeSeconds[input.kind],
      });
      return {
        serviceAccount: this.toAccount({ principal, keys: [apiKey.key] }),
        apiKey,
      };
    } catch (cause) {
      try {
        await this.servicePrincipals.remove({ id: principal.id });
      } catch (cleanup) {
        throw new ServiceAccountNotCreatedError({ cause, cleanup });
      }
      throw cause;
    }
  }

  async issueKey(props: {
    context: AuthContext;
    ownerUserId: string;
    input: NewApiKey;
  }): Promise<IssuedApiKey> {
    const input = newApiKeySchema.parse(props.input);
    const principal = await this.owned({
      ownerUserId: props.ownerUserId,
      serviceAccountId: input.serviceAccountId,
    });
    return this.apiKeys.issue({
      context: props.context,
      principalId: principal.id,
      scopes: principal.scopes,
      lifetimeSeconds: keyLifetimeSeconds[this.kindOf(principal)],
    });
  }

  /** Keys go first, so a failure part-way still leaves the account unable to authenticate. */
  async revokeAccount(props: {
    context: AuthContext;
    ownerUserId: string;
    serviceAccountId: string;
  }): Promise<void> {
    const principal = await this.owned(props);
    await this.apiKeys.revokeAllFor({
      context: props.context,
      principalId: principal.id,
    });
    await this.servicePrincipals.remove({ id: principal.id });
  }

  async revokeKey(props: {
    context: AuthContext;
    ownerUserId: string;
    keyId: string;
  }): Promise<void> {
    const principalId = await this.apiKeys.ownerOf(props);
    const principal =
      principalId === null
        ? null
        : await this.servicePrincipals.find({ id: principalId });
    if (principal === null || principal.ownerUserId !== props.ownerUserId) {
      throw new ApiKeyNotFoundError();
    }
    await this.apiKeys.revoke(props);
  }

  private callerAccount(principal: ServicePrincipal): AgentCaller['account'] {
    if (principal.agentName !== null) {
      return { kind: 'agent', agentName: principal.agentName };
    }
    if (principal.benchId !== null) {
      return { kind: 'bench', benchId: principal.benchId };
    }
    throw new ApiKeyRejectedError();
  }

  private async owned(props: {
    ownerUserId: string;
    serviceAccountId: string;
  }): Promise<ServicePrincipal> {
    const principal = await this.servicePrincipals.find({
      id: props.serviceAccountId,
    });
    if (principal === null || principal.ownerUserId !== props.ownerUserId) {
      throw new ServiceAccountNotFoundError();
    }
    return principal;
  }

  private kindOf(principal: ServicePrincipal): ServiceAccountKind {
    return principal.agentName === null ? 'bench' : 'agent';
  }

  private toAccount(props: {
    principal: ServicePrincipal;
    keys: ApiKeySummary[];
  }): ServiceAccount {
    const { principal } = props;
    return {
      id: principal.id,
      kind: this.kindOf(principal),
      name: principal.name,
      benchId: principal.benchId,
      agentName: principal.agentName,
      description: principal.description,
      scopes: principal.scopes,
      createdAt: principal.createdAt,
      keys: props.keys,
    };
  }
}
