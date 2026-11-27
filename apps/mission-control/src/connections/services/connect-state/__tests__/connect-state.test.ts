import { afterEach, describe, expect, it, vi } from 'vitest';

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
  /** Sets the clock `offsetSeconds` after `issuedAt`. */
  static at(offsetSeconds: number): void {
    vi.useFakeTimers({
      toFake: ['Date'],
      now: issuedAt.getTime() + offsetSeconds * 1000,
    });
  }
}

Clock.at(0);
const token = new SignedConnectState({ secret }).issue(request);
vi.useRealTimers();

afterEach(() => {
  vi.useRealTimers();
});

describe('SignedConnectState', () => {
  it('reads back what it issued for the same person and provider', () => {
    Clock.at(60);
    const state = new SignedConnectState({ secret });

    expect(state.read({ token, userId, provider: 'github' })).toMatchObject(
      request,
    );
  });

  it('refuses another person', () => {
    Clock.at(60);
    const state = new SignedConnectState({ secret });

    expect(
      state.read({
        token,
        userId: '00000000-0000-4000-8000-00000000000b',
        provider: 'github',
      }),
    ).toBeNull();
  });

  it('refuses another provider', () => {
    Clock.at(60);
    const state = new SignedConnectState({ secret });

    expect(state.read({ token, userId, provider: 'jira' })).toBeNull();
  });

  it('expires after ten minutes', () => {
    Clock.at(600);
    const state = new SignedConnectState({ secret });

    expect(state.read({ token, userId, provider: 'github' })).toBeNull();
  });

  it('refuses a state signed with another secret', () => {
    Clock.at(60);
    const state = new SignedConnectState({
      secret: 'another-secret-that-is-32-characters-long',
    });

    expect(state.read({ token, userId, provider: 'github' })).toBeNull();
  });

  it('refuses an edited payload', () => {
    Clock.at(60);
    const state = new SignedConnectState({ secret });
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
