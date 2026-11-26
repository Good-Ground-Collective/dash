import {
  type AuthContext,
  type BetterAuthOptions,
  type BetterAuthPlugin,
  getCurrentAdapter,
} from 'better-auth';
import { createAuthMiddleware, getSessionFromCtx } from 'better-auth/api';

import {
  principalKindSchema,
  serviceEmailDomain,
} from '#src/auth/contracts/principal.ts';
import { ServicePrincipalForbiddenError } from '#src/auth/errors.ts';

/** Matched by path, so the check holds once the passkey plugin is added. Keep in step with its endpoint names. */
const passkeyRegistrationPaths: ReadonlySet<string> = new Set([
  '/passkey/generate-register-options',
  '/passkey/verify-registration',
]);

type HookOptions = Pick<BetterAuthOptions, 'databaseHooks'>;
type BeforeHooks = NonNullable<
  NonNullable<BetterAuthPlugin['hooks']>['before']
>;

export interface PrincipalGuard {
  /** Adds `kind` to Better Auth's `user` and refuses web sessions and passkeys to service principals. */
  readonly plugin: BetterAuthPlugin;
  /** Rejects with `ServicePrincipalForbiddenError` unless `userId` is a person. Fails closed for an unknown id. Reads inside the caller's transaction, so a user created in it is visible. */
  assertPerson(props: {
    context: AuthContext;
    userId: string;
    action: string;
  }): Promise<void>;
}

/**
 * Keeps service principals to API keys. Every interactive sign-in ends in a session insert, so
 * refusing that insert covers passkeys and recovery alike; the passkey registration check
 * stops a session from ever being used to give a service principal a passkey.
 */
export class KindPrincipalGuard implements PrincipalGuard {
  readonly plugin: BetterAuthPlugin;

  constructor() {
    this.plugin = {
      id: 'principal-guard',
      schema: {
        user: {
          fields: {
            kind: {
              type: [...principalKindSchema.options],
              required: true,
              defaultValue: principalKindSchema.enum.user,
              input: false,
            },
          },
        },
      },
      init: (context) => ({ options: this.databaseHooks({ context }) }),
      hooks: { before: this.passkeyRegistrationHooks() },
    };
  }

  async assertPerson(props: {
    context: AuthContext;
    userId: string;
    action: string;
  }): Promise<void> {
    const adapter = await getCurrentAdapter(props.context.adapter);
    const principal = await adapter.findOne<{ kind: string }>({
      model: 'user',
      where: [{ field: 'id', value: props.userId }],
      select: ['kind'],
    });
    if (principal?.kind !== principalKindSchema.enum.user) {
      throw new ServicePrincipalForbiddenError({ action: props.action });
    }
  }

  private databaseHooks(props: { context: AuthContext }): HookOptions {
    return {
      databaseHooks: {
        user: {
          create: {
            before: async (user) => {
              if (user.email.toLowerCase().endsWith(`@${serviceEmailDomain}`)) {
                throw new ServicePrincipalForbiddenError({
                  action: 'sign up through Better Auth',
                });
              }
            },
          },
        },
        session: {
          create: {
            before: async (session) => {
              await this.assertPerson({
                context: props.context,
                userId: session.userId,
                action: 'hold a web session',
              });
            },
          },
        },
      },
    };
  }

  private passkeyRegistrationHooks(): BeforeHooks {
    return [
      {
        matcher: (context) =>
          context.path !== undefined &&
          passkeyRegistrationPaths.has(context.path),
        handler: createAuthMiddleware(async (context) => {
          const session = await getSessionFromCtx(context);
          if (session !== null) {
            await this.assertPerson({
              context: context.context,
              userId: session.user.id,
              action: 'register a passkey',
            });
          }
        }),
      },
    ];
  }
}
