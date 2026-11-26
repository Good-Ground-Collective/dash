import type { AuthContext, BetterAuthPlugin } from 'better-auth';
import { createAuthEndpoint, sessionMiddleware } from 'better-auth/api';
import { z } from 'zod';

import { principalKindSchema } from '#src/auth/contracts/principal.ts';
import {
  apiKeyRefSchema,
  newApiKeySchema,
  newServiceAccountSchema,
  serviceAccountRefSchema,
} from '#src/auth/contracts/service-account.ts';
import { ServicePrincipalForbiddenError } from '#src/auth/errors.ts';
import type { FreshSession } from '#src/auth/services/fresh-session/fresh-session.ts';
import type { ServiceAccounts } from '#src/auth/services/service-accounts/service-accounts.ts';

/** The part of Better Auth's session Dash reads to authorise an owner. */
const ownerSessionSchema = z.object({
  user: z.object({ id: z.uuid(), kind: principalKindSchema }),
  session: z.object({ createdAt: z.coerce.date() }),
});

type OwnerSession = z.infer<typeof ownerSessionSchema>;

/**
 * The owner-facing API under `/api/auth/service-accounts`, as Better Auth endpoints so the origin
 * check and session cookie apply. People only. Listing needs any session; creating, issuing and
 * revoking need a passkey sign-in from the fresh window, as passkey changes do.
 */
export class ServiceAccountEndpoints {
  readonly plugin: BetterAuthPlugin;
  private readonly serviceAccounts: ServiceAccounts;
  private readonly freshSession: FreshSession;

  constructor(props: {
    serviceAccounts: ServiceAccounts;
    freshSession: FreshSession;
  }) {
    this.serviceAccounts = props.serviceAccounts;
    this.freshSession = props.freshSession;
    this.plugin = {
      id: 'service-accounts',
      endpoints: { ...this.reads(), ...this.changes() },
    };
  }

  private reads(): NonNullable<BetterAuthPlugin['endpoints']> {
    return {
      listServiceAccounts: createAuthEndpoint(
        '/service-accounts/list',
        { method: 'GET', use: [sessionMiddleware] },
        async (context) =>
          context.json(
            await this.serviceAccounts.list({
              context: context.context,
              ownerUserId: this.owner(context.context.session).user.id,
            }),
          ),
      ),
    };
  }

  private changes(): NonNullable<BetterAuthPlugin['endpoints']> {
    const use = [sessionMiddleware];
    return {
      createServiceAccount: createAuthEndpoint(
        '/service-accounts/create',
        { method: 'POST', body: newServiceAccountSchema, use },
        async (context) =>
          context.json(
            await this.serviceAccounts.create({
              context: context.context,
              ownerUserId: this.freshOwner(context.context.session),
              input: context.body,
            }),
          ),
      ),
      revokeServiceAccount: createAuthEndpoint(
        '/service-accounts/revoke',
        { method: 'POST', body: serviceAccountRefSchema, use },
        async (context) => {
          await this.serviceAccounts.revokeAccount({
            context: context.context,
            ownerUserId: this.freshOwner(context.context.session),
            serviceAccountId: context.body.serviceAccountId,
          });
          return context.json({ success: true });
        },
      ),
      createServiceAccountKey: createAuthEndpoint(
        '/service-accounts/keys/create',
        { method: 'POST', body: newApiKeySchema, use },
        async (context) =>
          context.json(
            await this.serviceAccounts.issueKey({
              context: context.context,
              ownerUserId: this.freshOwner(context.context.session),
              input: context.body,
            }),
          ),
      ),
      revokeServiceAccountKey: createAuthEndpoint(
        '/service-accounts/keys/revoke',
        { method: 'POST', body: apiKeyRefSchema, use },
        async (context) => {
          await this.serviceAccounts.revokeKey({
            context: context.context,
            ownerUserId: this.freshOwner(context.context.session),
            keyId: context.body.keyId,
          });
          return context.json({ success: true });
        },
      ),
    };
  }

  /** The signed-in person. Service principals never hold sessions, but this fails closed if one did. */
  private owner(session: AuthContext['session']): OwnerSession {
    const owner = ownerSessionSchema.parse(session);
    if (owner.user.kind !== principalKindSchema.enum.user) {
      throw new ServicePrincipalForbiddenError({
        action: 'manage service accounts',
      });
    }
    return owner;
  }

  /** The signed-in person's id, once their sign-in is fresh enough to change credentials. */
  private freshOwner(session: AuthContext['session']): string {
    const owner = this.owner(session);
    this.freshSession.assert(owner.session);
    return owner.user.id;
  }
}
