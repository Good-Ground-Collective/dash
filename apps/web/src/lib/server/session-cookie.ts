/** Tells whether a request carries a session cookie. */
export interface SessionCookie {
  isPresent(props: { get: (name: string) => string | undefined }): boolean;
}

/** The Better Auth session cookie Mission Control sets, with or without the `__Secure-` prefix. */
export class BetterAuthSessionCookie implements SessionCookie {
  isPresent(props: { get: (name: string) => string | undefined }): boolean {
    return BetterAuthSessionCookie.NAMES.some(
      (name) => props.get(name) !== undefined,
    );
  }

  static readonly NAMES = [
    '__Secure-better-auth.session_token',
    'better-auth.session_token',
  ];
}

export const sessionCookie: SessionCookie = new BetterAuthSessionCookie();
