/** Presence only decides whether to ask Mission Control; it does not prove the session is valid. */
export interface SessionCookie {
  /** The cookie names Mission Control reads, and the only cookies forwarded to it. */
  readonly names: readonly string[];
  isPresent(props: { get: (name: string) => string | undefined }): boolean;
}

/** The Better Auth session cookie Mission Control sets, with or without the `__Secure-` prefix. */
export class BetterAuthSessionCookie implements SessionCookie {
  readonly names = [
    '__Secure-better-auth.session_token',
    'better-auth.session_token',
  ];

  isPresent(props: { get: (name: string) => string | undefined }): boolean {
    return this.names.some((name) => props.get(name) !== undefined);
  }
}

export const sessionCookie: SessionCookie = new BetterAuthSessionCookie();
