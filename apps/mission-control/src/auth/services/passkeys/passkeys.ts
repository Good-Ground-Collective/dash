import { passkey } from '@better-auth/passkey';
import type { AuthContext, BetterAuthPlugin } from 'better-auth';
import { createAuthMiddleware, getSessionFromCtx } from 'better-auth/api';
import { z } from 'zod';

import {
  LastPasskeyError,
  PasskeyEnrolmentRejectedError,
  SessionNotFreshError,
} from '#src/auth/errors.ts';
import type { PrincipalGuard } from '#src/auth/services/principal-guard/principal-guard.ts';
import { webOriginSchema } from '#src/platform/definitions/config/app-config.ts';

type PasskeyOptions = NonNullable<Parameters<typeof passkey>[0]>;
type RegistrationOptions = NonNullable<PasskeyOptions['registration']>;
type ResolveUser = NonNullable<RegistrationOptions['resolveUser']>;
type AfterVerification = NonNullable<RegistrationOptions['afterVerification']>;
type BeforeHooks = NonNullable<
  NonNullable<BetterAuthPlugin['hooks']>['before']
>;

/** Changing these needs a session started by a passkey sign-in within the fresh window. */
const sensitivePaths: ReadonlySet<string> = new Set([
  '/passkey/generate-register-options',
  '/passkey/verify-registration',
  '/passkey/update-passkey',
  '/passkey/delete-passkey',
]);

const registrationBodySchema = z.object({
  createSession: z.boolean().optional(),
});

export const passkeySettingsSchema = z.object({
  webOrigin: webOriginSchema.describe(
    'Where ceremonies run. Its host is the relying party id: `dash.doublel.studio` in production, `localhost` locally.',
  ),
  freshAgeSeconds: z.number().int().positive(),
});

export type PasskeySettings = z.input<typeof passkeySettingsSchema>;

/** Who a passkey-first registration is for, before the passkey exists. */
export interface PasskeyEnrolmentUser {
  id: string;
  name: string;
  displayName?: string;
}

/**
 * A way to enrol a passkey without a session, such as setup or a recovery code. The registration
 * `context` names the enrolment, and the first source that recognises it handles it.
 */
export interface PasskeyEnrolmentSource {
  /** Checks the enrolment without spending it. `null` when the enrolment isn't this source's; rejects one that is but can't be used. */
  resolve(props: {
    context: AuthContext;
    enrolment: string;
  }): Promise<PasskeyEnrolmentUser | null>;
  /** Spends the enrolment inside the registration transaction and returns the principal the passkey belongs to. `null` when it isn't this source's. */
  complete(props: {
    context: AuthContext;
    enrolment: string;
  }): Promise<string | null>;
}

export interface Passkeys {
  /** Better Auth's passkey plugin, plus the rules Dash adds: fresh sign-ins for changes and never removing the last passkey. */
  readonly plugins: readonly BetterAuthPlugin[];
}

/**
 * Passkeys are the only way in. Signed in, a person can add, rename and remove passkeys after a
 * fresh sign-in. Signed out, registration needs an enrolment from a source. Either way, the
 * passkey's owner must be a person: sessionless registration is invisible to the guard's session
 * check, so `afterVerification` asks the guard directly.
 */
export class WebAuthnPasskeys implements Passkeys {
  readonly plugins: readonly BetterAuthPlugin[];
  private readonly guard: PrincipalGuard;
  private readonly sources: readonly PasskeyEnrolmentSource[];
  private readonly freshAgeSeconds: number;

  constructor(
    props: {
      guard: PrincipalGuard;
      sources: readonly PasskeyEnrolmentSource[];
    } & PasskeySettings,
  ) {
    const settings = passkeySettingsSchema.parse(props);
    this.guard = props.guard;
    this.sources = props.sources;
    this.freshAgeSeconds = settings.freshAgeSeconds;

    this.plugins = [
      passkey({
        rpID: new URL(settings.webOrigin).hostname,
        rpName: 'Dash',
        origin: [settings.webOrigin],
        authenticatorSelection: {
          residentKey: 'required',
          userVerification: 'required',
        },
        registration: {
          requireSession: false,
          resolveUser: this.resolveUser,
          afterVerification: this.afterVerification,
        },
      }),
      {
        id: 'passkey-policy',
        hooks: { before: this.policyHooks() },
      },
    ];
  }

  private readonly resolveUser: ResolveUser = async ({ ctx, context }) => {
    if (context === null || context === undefined) {
      throw new PasskeyEnrolmentRejectedError({
        reason: 'sign in first, or start from setup.',
      });
    }

    for (const source of this.sources) {
      const user = await source.resolve({
        context: ctx.context,
        enrolment: context,
      });
      if (user !== null) {
        return user;
      }
    }
    throw new PasskeyEnrolmentRejectedError({ reason: 'unknown enrolment.' });
  };

  private readonly afterVerification: AfterVerification = async ({
    ctx,
    context,
  }) => {
    const session = await getSessionFromCtx(ctx);
    if (session !== null) {
      await this.guard.assertPerson({
        context: ctx.context,
        userId: session.user.id,
        action: 'register a passkey',
      });
      return undefined;
    }

    const body = registrationBodySchema.safeParse(ctx.body);
    if (!body.success || body.data.createSession !== true) {
      throw new PasskeyEnrolmentRejectedError({
        reason: 'a passkey-first enrolment must sign you in (`createSession`).',
      });
    }

    const userId = await this.complete({
      context: ctx.context,
      enrolment: context ?? '',
    });
    await this.guard.assertPerson({
      context: ctx.context,
      userId,
      action: 'register a passkey',
    });
    return { userId };
  };

  private async complete(props: {
    context: AuthContext;
    enrolment: string;
  }): Promise<string> {
    for (const source of this.sources) {
      const userId = await source.complete(props);
      if (userId !== null) {
        return userId;
      }
    }
    throw new PasskeyEnrolmentRejectedError({ reason: 'unknown enrolment.' });
  }

  private policyHooks(): BeforeHooks {
    return [
      {
        matcher: (context) =>
          context.path !== undefined && sensitivePaths.has(context.path),
        handler: createAuthMiddleware(async (context) => {
          const session = await getSessionFromCtx(context);
          if (session === null) {
            return;
          }

          const age =
            Date.now() - new Date(session.session.createdAt).getTime();
          if (age >= this.freshAgeSeconds * 1000) {
            throw new SessionNotFreshError({
              freshMinutes: Math.round(this.freshAgeSeconds / 60),
            });
          }

          if (context.path === '/passkey/delete-passkey') {
            const owned = await context.context.adapter.count({
              model: 'passkey',
              where: [{ field: 'userId', value: session.user.id }],
            });
            if (owned <= 1) {
              throw new LastPasskeyError();
            }
          }
        }),
      },
    ];
  }
}
