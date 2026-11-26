/** Recognises the Better Auth session cookie Mission Control sets, with or without the `__Secure-` prefix. */
export class SessionCookie {
  isPresent(props: { get: (name: string) => string | undefined }): boolean {
    return SessionCookie.NAMES.some((name) => props.get(name) !== undefined);
  }

  static readonly NAMES = [
    '__Secure-better-auth.session_token',
    'better-auth.session_token',
  ];
}

export const sessionCookie = new SessionCookie();
