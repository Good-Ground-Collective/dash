import { type Auth, betterAuth, type BetterAuthOptions } from 'better-auth';
import { z } from 'zod';

import { principalKindSchema } from '#src/auth/contracts/principal.ts';
import type { AuthStorage } from '#src/auth/repositories/auth-store/auth-store.ts';
import { WebAuthnPasskeys } from '#src/auth/services/passkeys/passkeys.ts';
import {
  KindPrincipalGuard,
  type PrincipalGuard,
} from '#src/auth/services/principal-guard/principal-guard.ts';
import { type Setup, TokenSetup } from '#src/auth/services/setup/setup.ts';
import { webOriginSchema } from '#src/platform/definitions/config/app-config.ts';

const daySeconds = 60 * 60 * 24;
const sessionLifetimeSeconds = 30 * daySeconds;
const sessionRefreshAfterSeconds = daySeconds;
const freshSessionSeconds = 15 * 60;

export const identitySettingsSchema = z.object({
  secret: z
    .string()
    .min(32)
    .describe('Signs session cookies and encrypts Better Auth secrets.'),
  baseUrl: webOriginSchema.describe(
    "Mission Control's public origin, such as https://api.dash.doublel.studio.",
  ),
  webOrigin: webOriginSchema.describe(
    'The web app, where passkey ceremonies run. Its host is the passkey relying party id.',
  ),
  trustedOrigins: z
    .array(webOriginSchema)
    .readonly()
    .describe(
      'Origins allowed to make credentialed calls: the CORS allowlist.',
    ),
  cookieDomain: z
    .string()
    .min(1)
    .optional()
    .describe(
      'Shares the session cookie with this domain and its subdomains. Unset keeps it host-only.',
    ),
  secureCookies: z
    .boolean()
    .describe('Marks cookies `Secure` and gives them the `__Secure-` prefix.'),
});

export type IdentitySettings = z.input<typeof identitySettingsSchema>;

export const principalSessionSchema = z.object({
  principalId: z.uuid(),
  kind: principalKindSchema,
  expiresAt: z.date(),
});

export type PrincipalSession = z.infer<typeof principalSessionSchema>;

/** The part of Better Auth's session payload Dash reads. Better Auth's own types don't carry plugin fields. */
export const betterAuthSessionSchema = z.object({
  user: z.object({ id: z.uuid(), kind: principalKindSchema }),
  session: z.object({ expiresAt: z.date() }),
});

export interface Identity {
  /** Mission Control's public origin, which relative request URLs resolve against. */
  readonly baseUrl: string;
  readonly basePath: string;
  /** Better Auth's server API and context, for plugins and tests that need its internals. */
  readonly auth: Auth;
  /** Refuses web sessions and passkeys to service principals. Sessionless passkey flows call its `assertPerson`. */
  readonly guard: PrincipalGuard;
  /** Bootstraps the first person with a one-time setup token. */
  readonly setup: Setup;
  /** Run at boot: a setup token to log once while nobody has signed up, otherwise `null`. */
  issueSetupToken(): Promise<string | null>;
  /** Answers one request to a path under `basePath`. */
  handle(request: Request): Promise<Response>;
  /** The principal behind the request's session cookie, or `null` without a valid session. Read-only: sessions slide through `/api/auth/get-session`, which can set the renewed cookie. */
  session(props: { headers: Headers }): Promise<PrincipalSession | null>;
}

/**
 * Better Auth configured for Dash: principals in `user`, passkeys as the only sign-in, 30-day
 * sliding sessions in an HttpOnly, SameSite=Lax cookie, fresh for 15 minutes after sign-in. The origin check is pinned on because Better Auth skips it when
 * NODE_ENV is `test`, which would let tests pass that production would fail.
 */
export class BetterAuthIdentity implements Identity {
  readonly auth: Auth;
  readonly baseUrl: string;
  readonly basePath = '/api/auth';
  readonly guard: PrincipalGuard = new KindPrincipalGuard();
  readonly setup: Setup = new TokenSetup();

  constructor(props: { storage: AuthStorage } & IdentitySettings) {
    const settings = identitySettingsSchema.parse(props);
    this.baseUrl = settings.baseUrl;
    const passkeys = new WebAuthnPasskeys({
      guard: this.guard,
      sources: [this.setup],
      webOrigin: settings.webOrigin,
      freshAgeSeconds: freshSessionSeconds,
    });
    this.auth = betterAuth<BetterAuthOptions>({
      appName: 'Dash',
      baseURL: settings.baseUrl,
      basePath: this.basePath,
      secret: settings.secret,
      database: props.storage,
      trustedOrigins: [...settings.trustedOrigins],
      plugins: [this.guard.plugin, this.setup.plugin, ...passkeys.plugins],
      session: {
        expiresIn: sessionLifetimeSeconds,
        updateAge: sessionRefreshAfterSeconds,
        freshAge: freshSessionSeconds,
      },
      advanced: {
        database: { generateId: 'uuid' },
        disableOriginCheck: false,
        useSecureCookies: settings.secureCookies,
        defaultCookieAttributes: { httpOnly: true, sameSite: 'lax' },
        crossSubDomainCookies:
          settings.cookieDomain === undefined
            ? { enabled: false }
            : { enabled: true, domain: settings.cookieDomain },
      },
      telemetry: { enabled: false },
    });
  }

  async issueSetupToken(): Promise<string | null> {
    return this.setup.issue({ context: await this.auth.$context });
  }

  async handle(request: Request): Promise<Response> {
    return this.auth.handler(request);
  }

  async session(props: { headers: Headers }): Promise<PrincipalSession | null> {
    const found = await this.auth.api.getSession({
      headers: props.headers,
      query: { disableRefresh: true },
    });
    if (found === null) {
      return null;
    }

    const { user, session } = betterAuthSessionSchema.parse(found);
    return principalSessionSchema.parse({
      principalId: user.id,
      kind: user.kind,
      expiresAt: session.expiresAt,
    });
  }
}
