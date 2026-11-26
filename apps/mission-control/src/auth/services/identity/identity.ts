import { type Auth, betterAuth, type BetterAuthOptions } from 'better-auth';
import { z } from 'zod';

import type { AuthStorage } from '#src/auth/repositories/auth-store/auth-store.ts';
import type { PrincipalGuard } from '#src/auth/services/principal-guard/principal-guard.ts';
import { webOriginSchema } from '#src/platform/definitions/config/app-config.ts';

const daySeconds = 60 * 60 * 24;
const sessionLifetimeSeconds = 30 * daySeconds;
const sessionRefreshAfterSeconds = daySeconds;

export const identitySettingsSchema = z.object({
  secret: z
    .string()
    .min(32)
    .describe('Signs session cookies and encrypts Better Auth secrets.'),
  baseUrl: webOriginSchema.describe(
    "Mission Control's public origin, such as https://api.dash.doublel.studio.",
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

export interface Identity {
  /** The path Better Auth serves its endpoints under. */
  readonly basePath: string;
  /** Better Auth's server API, for modules that read the session. */
  readonly auth: Auth;
  /** Answers one request to a path under `basePath`. */
  handle(request: Request): Promise<Response>;
}

/** Better Auth configured for Dash: principals in `user`, 30-day sliding sessions in an HttpOnly, SameSite=Lax cookie. */
export class BetterAuthIdentity implements Identity {
  readonly auth: Auth;
  readonly basePath = '/api/auth';

  constructor(
    props: {
      storage: AuthStorage;
      guard: PrincipalGuard;
    } & IdentitySettings,
  ) {
    const settings = identitySettingsSchema.parse(props);
    this.auth = betterAuth<BetterAuthOptions>({
      appName: 'Dash',
      baseURL: settings.baseUrl,
      basePath: this.basePath,
      secret: settings.secret,
      database: props.storage,
      trustedOrigins: [...settings.trustedOrigins],
      plugins: [props.guard.plugin],
      session: {
        expiresIn: sessionLifetimeSeconds,
        updateAge: sessionRefreshAfterSeconds,
      },
      advanced: {
        database: { generateId: 'uuid' },
        /** Better Auth skips its origin check when NODE_ENV is `test`. Pinning it keeps tests honest. */
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

  async handle(request: Request): Promise<Response> {
    return this.auth.handler(request);
  }
}
