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

  it('passes on why Mission Control refused to enrol a passkey', () => {
    expect(
      passkeyWording.explain(
        new PasskeyAuthError({
          code: 'PASSKEY_ENROLMENT_REJECTED',
          message:
            "Can't enrol this passkey: sign in first, or start from setup.",
          status: 401,
        }),
      ),
    ).toBe("Can't enrol this passkey: sign in first, or start from setup.");
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

describe('PasskeyWording added', () => {
  it('says when a passkey was added, relative for its first hour', () => {
    const passkey = {
      id: 'p1',
      name: null,
      createdAt: new Date('2026-11-20T10:00:00.000Z'),
      deviceType: 'multiDevice',
      backedUp: true,
    };
    const at = (time: string) => passkeyWording.added(passkey, new Date(time));

    expect(at('2026-11-20T10:00:59.000Z')).toBe('Added just now');
    expect(at('2026-11-20T10:01:00.000Z')).toBe('Added 1 minute ago');
    expect(at('2026-11-20T10:59:00.000Z')).toBe('Added 59 minutes ago');
    expect(at('2026-11-20T11:00:00.000Z')).toBe('Added Nov 20, 2026');
  });
});
