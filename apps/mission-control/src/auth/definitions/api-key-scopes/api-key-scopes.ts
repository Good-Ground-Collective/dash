import { z } from 'zod';

/** Coarse permission statements an API key carries, written `<resource>:<action>`. Add one when a feature needs it, and label it in the web app's service account wording. */
export const apiKeyScopeSchema = z.enum(['heartbeat:write', 'telemetry:write']);

export type ApiKeyScope = z.infer<typeof apiKeyScopeSchema>;

/** Better Auth's permission statements: actions per resource. */
export type ApiKeyStatements = Record<string, string[]>;

export interface ApiKeyScopeRegistry {
  /** All scopes, in the order the UI offers them. */
  readonly all: readonly ApiKeyScope[];
  /** Scopes as the statements the api-key plugin stores. */
  toStatements(scopes: readonly ApiKeyScope[]): ApiKeyStatements;
  /** The known scopes in stored statements. Unknown statements are dropped, so a retired scope grants nothing. */
  fromStatements(statements: ApiKeyStatements | null): ApiKeyScope[];
}

export class RegisteredApiKeyScopes implements ApiKeyScopeRegistry {
  readonly all: readonly ApiKeyScope[] = apiKeyScopeSchema.options;

  toStatements(scopes: readonly ApiKeyScope[]): ApiKeyStatements {
    const actions = new Map<string, string[]>();
    for (const scope of new Set(scopes)) {
      const [resource = '', action = ''] = scope.split(':');
      actions.set(resource, [...(actions.get(resource) ?? []), action]);
    }
    return Object.fromEntries(actions);
  }

  fromStatements(statements: ApiKeyStatements | null): ApiKeyScope[] {
    const granted = new Set(
      Object.entries(statements ?? {}).flatMap(([resource, actions]) =>
        actions.map((action) => `${resource}:${action}`),
      ),
    );
    return this.all.filter((scope) => granted.has(scope));
  }
}

export const apiKeyScopes: ApiKeyScopeRegistry = new RegisteredApiKeyScopes();
