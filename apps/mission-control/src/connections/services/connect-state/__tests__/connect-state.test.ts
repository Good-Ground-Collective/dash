import { describe, expect, it } from 'vitest';

import { SignedConnectState } from '#src/connections/services/connect-state/connect-state.ts';

const secret = 'test-secret-that-is-at-least-32-characters';
const userId = '00000000-0000-4000-8000-00000000000a';
const issuedAt = new Date('2026-11-26T12:00:00Z');
const request = {
  userId,
  provider: 'github',
  returnTo: '/setup/github',
  installationId: '42',
};

class Clock {
  static at(offsetSeconds: number): () => Date {
    return () => new Date(issuedAt.getTime() + offsetSeconds * 1000);
  }
}

describe('SignedConnectState', () => {
  const token = new SignedConnectState({ secret, now: Clock.at(0) }).issue(
    request,
  );

  it('reads back what it issued for the same person and provider', () => {
    const state = new SignedConnectState({ secret, now: Clock.at(60) });

    expect(state.read({ token, userId, provider: 'github' })).toMatchObject(
      request,
    );
  });

  it('refuses another person', () => {
    const state = new SignedConnectState({ secret, now: Clock.at(60) });

    expect(
      state.read({
        token,
        userId: '00000000-0000-4000-8000-00000000000b',
        provider: 'github',
      }),
    ).toBeNull();
  });

  it('refuses another provider', () => {
    const state = new SignedConnectState({ secret, now: Clock.at(60) });

    expect(state.read({ token, userId, provider: 'jira' })).toBeNull();
  });

  it('expires after ten minutes', () => {
    const state = new SignedConnectState({ secret, now: Clock.at(600) });

    expect(state.read({ token, userId, provider: 'github' })).toBeNull();
  });

  it('refuses a state signed with another secret', () => {
    const state = new SignedConnectState({
      secret: 'another-secret-that-is-32-characters-long',
      now: Clock.at(60),
    });

    expect(state.read({ token, userId, provider: 'github' })).toBeNull();
  });

  it('refuses an edited payload', () => {
    const state = new SignedConnectState({ secret, now: Clock.at(60) });
    const [, signature] = token.split('.');
    const forged = Buffer.from(
      JSON.stringify({ ...request, expiresAt: 9_999_999_999, nonce: 'n' }),
    ).toString('base64url');

    expect(
      state.read({
        token: `${forged}.${signature ?? ''}`,
        userId,
        provider: 'github',
      }),
    ).toBeNull();
  });
});
