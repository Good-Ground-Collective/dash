import { apiKey } from '@better-auth/api-key';
import type { AuthContext, BetterAuthPlugin } from 'better-auth';
import { createAuthMiddleware } from 'better-auth/api';
import { z } from 'zod';

import type {
  ApiKeySummary,
  IssuedApiKey,
} from '#src/auth/contracts/service-account.ts';
import {
  type ApiKeyScope,
  apiKeyScopes,
} from '#src/auth/definitions/api-key-scopes/api-key-scopes.ts';
import {
  ApiKeyEndpointClosedError,
  ApiKeyNotIssuedError,
} from '#src/auth/errors.ts';

const apiKeyModel = 'apikey';
/** Characters of the secret kept after the prefix, to recognise a key by. */
const identifyingCharacters = 6;

export const apiKeyPrefixSchema = z
  .enum(['dash_live_', 'dash_dev_'])
  .describe('`dash_live_` in production, `dash_dev_` everywhere else.');

export type ApiKeyPrefix = z.infer<typeof apiKeyPrefixSchema>;

export const apiKeySettingsSchema = z.object({ prefix: apiKeyPrefixSchema });

export type ApiKeySettings = z.input<typeof apiKeySettingsSchema>;

const statementsSchema = z.record(z.string(), z.array(z.string()));

/** `permissions` as the store keeps it: JSON text of the statements. Text that isn't JSON is a Zod issue, not a SyntaxError. */
const statementsTextSchema = z
  .string()
  .transform((value, context) => {
    try {
      const parsed: unknown = JSON.parse(value);
      return parsed;
    } catch {
      context.addIssue({ code: 'custom', message: 'permissions is not JSON' });
      return z.NEVER;
    }
  })
  .pipe(statementsSchema);

const timestampSchema = z.coerce.date().transform((date) => date.toISOString());

/** A row of the `apikey` model, as far as Dash reads it. `permissions` is stored as JSON text. */
const storedApiKeySchema = z.object({
  id: z.string(),
  referenceId: z.string(),
  start: z.string().nullable(),
  permissions: statementsTextSchema.nullable(),
  createdAt: timestampSchema,
  expiresAt: timestampSchema.nullable(),
  lastRequest: timestampSchema.nullable(),
});

/** What the plugin's create and verify endpoints answer with: `permissions` already parsed. */
const returnedApiKeySchema = storedApiKeySchema.extend({
  permissions: statementsSchema.nullable(),
});

type StoredApiKey = z.output<typeof returnedApiKeySchema>;

export interface VerifiedApiKey {
  id: string;
  principalId: string;
  scopes: ApiKeyScope[];
}

export interface ApiKeys {
  /** The api-key plugin, plus a hook that closes its own endpoints to HTTP requests: keys are issued only through service accounts. */
  readonly plugins: readonly BetterAuthPlugin[];
  /** Issues a key to a principal. The secret comes back this once; only its hash is stored. `null` lifetime never expires. The owner's session is left out of the call, or the plugin would issue the key to the owner. */
  issue(props: {
    context: AuthContext;
    principalId: string;
    scopes: readonly ApiKeyScope[];
    lifetimeSeconds: number | null;
  }): Promise<IssuedApiKey>;
  /** The key's owner and scopes, or `null` for a key that is unknown, revoked or expired. Records the use as `last_used_at`. */
  verify(props: {
    context: AuthContext;
    key: string;
  }): Promise<VerifiedApiKey | null>;
  /** Keys per principal, oldest first. Principals without keys are absent. */
  listFor(props: {
    context: AuthContext;
    principalIds: readonly string[];
  }): Promise<Map<string, ApiKeySummary[]>>;
  ownerOf(props: {
    context: AuthContext;
    keyId: string;
  }): Promise<string | null>;
  /** Deletes the key, so the next request with it fails. `false` when it didn't exist. */
  revoke(props: { context: AuthContext; keyId: string }): Promise<boolean>;
  revokeAllFor(props: {
    context: AuthContext;
    principalId: string;
  }): Promise<void>;
}

/**
 * API keys through Better Auth's api-key plugin, owned by `user` rows (`references: "user"`).
 * Keys are hashed at rest and keep their prefix plus six characters for recognition. The
 * plugin's per-key rate limit is off: it counts requests per day, which heartbeats would exhaust.
 */
export class PluginApiKeys implements ApiKeys {
  readonly plugins: readonly BetterAuthPlugin[];
  private readonly plugin: ReturnType<typeof apiKey>;

  constructor(props: ApiKeySettings) {
    const { prefix } = apiKeySettingsSchema.parse(props);
    this.plugin = apiKey({
      references: 'user',
      defaultPrefix: prefix,
      apiKeyHeaders: 'x-api-key',
      startingCharactersConfig: {
        shouldStore: true,
        charactersLength: prefix.length + identifyingCharacters,
      },
      rateLimit: { enabled: false },
      enableSessionForAPIKeys: false,
    });
    this.plugins = [
      this.plugin,
      {
        id: 'api-key-policy',
        hooks: {
          before: [
            {
              matcher: (context) =>
                context.path?.startsWith('/api-key/') === true,
              handler: createAuthMiddleware(async (context) => {
                if (context.request !== undefined) {
                  throw new ApiKeyEndpointClosedError();
                }
              }),
            },
          ],
        },
      },
    ];
  }

  async issue(props: {
    context: AuthContext;
    principalId: string;
    scopes: readonly ApiKeyScope[];
    lifetimeSeconds: number | null;
  }): Promise<IssuedApiKey> {
    const created = await this.plugin.endpoints.createApiKey({
      context: { ...props.context, session: null },
      body: {
        userId: props.principalId,
        permissions: apiKeyScopes.toStatements(props.scopes),
        expiresIn: props.lifetimeSeconds,
      },
    });
    if (created.key === '') {
      throw new ApiKeyNotIssuedError();
    }
    return {
      key: this.toSummary(returnedApiKeySchema.parse(created)),
      secret: created.key,
    };
  }

  async verify(props: {
    context: AuthContext;
    key: string;
  }): Promise<VerifiedApiKey | null> {
    const result = await this.plugin.endpoints.verifyApiKey({
      context: props.context,
      body: { key: props.key },
    });
    if (!result.valid || result.key === null) {
      return null;
    }

    const key = returnedApiKeySchema.parse(result.key);
    return {
      id: key.id,
      principalId: key.referenceId,
      scopes: apiKeyScopes.fromStatements(key.permissions),
    };
  }

  async listFor(props: {
    context: AuthContext;
    principalIds: readonly string[];
  }): Promise<Map<string, ApiKeySummary[]>> {
    const keys = new Map<string, ApiKeySummary[]>();
    if (props.principalIds.length === 0) {
      return keys;
    }

    const rows = await props.context.adapter.findMany({
      model: apiKeyModel,
      where: [
        {
          field: 'referenceId',
          operator: 'in',
          value: [...props.principalIds],
        },
      ],
      sortBy: { field: 'createdAt', direction: 'asc' },
    });
    for (const row of z.array(storedApiKeySchema).parse(rows)) {
      keys.set(row.referenceId, [
        ...(keys.get(row.referenceId) ?? []),
        this.toSummary(row),
      ]);
    }
    return keys;
  }

  async ownerOf(props: {
    context: AuthContext;
    keyId: string;
  }): Promise<string | null> {
    const row = await props.context.adapter.findOne({
      model: apiKeyModel,
      where: [{ field: 'id', value: props.keyId }],
    });
    return row === null ? null : storedApiKeySchema.parse(row).referenceId;
  }

  async revoke(props: {
    context: AuthContext;
    keyId: string;
  }): Promise<boolean> {
    const deleted = await props.context.adapter.deleteMany({
      model: apiKeyModel,
      where: [{ field: 'id', value: props.keyId }],
    });
    return deleted > 0;
  }

  async revokeAllFor(props: {
    context: AuthContext;
    principalId: string;
  }): Promise<void> {
    await props.context.adapter.deleteMany({
      model: apiKeyModel,
      where: [{ field: 'referenceId', value: props.principalId }],
    });
  }

  private toSummary(key: StoredApiKey): ApiKeySummary {
    return {
      id: key.id,
      start: key.start,
      scopes: apiKeyScopes.fromStatements(key.permissions),
      createdAt: key.createdAt,
      expiresAt: key.expiresAt,
      lastUsedAt: key.lastRequest,
    };
  }
}
