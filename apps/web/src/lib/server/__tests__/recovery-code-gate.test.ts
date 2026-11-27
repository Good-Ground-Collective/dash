import { describe, expect, it } from 'vitest';
import { recoveryCodeGate } from '#lib/server/recovery-code-gate.ts';

const unconfirmed = { confirmed: false, remaining: 0 };

describe('RecoveryCodeGate', () => {
  it.each(['/', '/settings', '/settings/service-accounts', '/settings/'])(
    'sends %s to the codes step until codes are confirmed',
    (pathname) => {
      expect(
        recoveryCodeGate.redirectFor({ pathname, status: unconfirmed }),
      ).toBe('/setup/recovery-codes');
    },
  );

  it.each([
    '/setup/recovery-codes',
    '/setup/recovery-codes/',
    '/setup',
    '/sign-in',
    '/recover',
    '/recover/passkey',
  ])(
    'leaves %s alone, so there is no loop and signing out works',
    (pathname) => {
      expect(
        recoveryCodeGate.redirectFor({ pathname, status: unconfirmed }),
      ).toBeNull();
    },
  );

  it('lets everyone through once codes are confirmed', () => {
    expect(
      recoveryCodeGate.redirectFor({
        pathname: '/settings',
        status: { confirmed: true, remaining: 1 },
      }),
    ).toBeNull();
  });

  it('lets everyone through when the status is unknown', () => {
    expect(
      recoveryCodeGate.redirectFor({ pathname: '/settings', status: null }),
    ).toBeNull();
  });
});
