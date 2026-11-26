import { describe, expect, it } from 'vitest';
import { sessionCookie } from '#lib/server/session-cookie.ts';

describe('SessionCookie', () => {
  it('finds the secure-prefixed and plain Better Auth cookies', () => {
    for (const name of [
      '__Secure-better-auth.session_token',
      'better-auth.session_token',
    ]) {
      const cookies = new Map([[name, 'token']]);
      expect(sessionCookie.isPresent({ get: (key) => cookies.get(key) })).toBe(
        true,
      );
    }
  });

  it('reports no session when neither cookie is set', () => {
    expect(sessionCookie.isPresent({ get: () => undefined })).toBe(false);
  });
});
