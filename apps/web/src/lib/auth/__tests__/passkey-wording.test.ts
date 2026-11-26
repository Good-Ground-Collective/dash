import { describe, expect, it } from 'vitest';
import { PasskeyAuthError } from '#lib/auth/passkey-auth-error.ts';
import { passkeyWording } from '#lib/auth/passkey-wording.ts';

describe('PasskeyWording', () => {
  it('explains Mission Control error codes in plain words', () => {
    expect(
      passkeyWording.explain(
        new PasskeyAuthError({ code: 'LAST_PASSKEY', status: 409 }),
      ),
    ).toBe('This is your only passkey. Add another before removing it.');
  });

  it('falls back to the server message for an unknown code', () => {
    expect(
      passkeyWording.explain(
        new PasskeyAuthError({ code: 'X', message: 'Odd', status: 400 }),
      ),
    ).toBe('Odd');
  });

  it('treats an aborted prompt as a cancellation', () => {
    expect(
      passkeyWording.isCancellation(
        new PasskeyAuthError({ code: 'ERROR_CEREMONY_ABORTED', status: 0 }),
      ),
    ).toBe(true);
  });

  it('labels and describes a passkey', () => {
    const passkey = {
      id: 'p1',
      name: '  ',
      createdAt: new Date('2026-11-20T10:00:00.000Z'),
      deviceType: 'singleDevice',
      backedUp: false,
    };

    expect(passkeyWording.label(passkey)).toBe('Unnamed passkey');
    expect(passkeyWording.detail(passkey)).toBe(
      'Added Nov 20, 2026 · On one device',
    );
  });
});
