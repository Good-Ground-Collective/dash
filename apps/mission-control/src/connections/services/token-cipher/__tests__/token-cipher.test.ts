import { describe, expect, it } from 'vitest';

import { SealedTokenError } from '#src/connections/errors.ts';
import { AesGcmTokenCipher } from '#src/connections/services/token-cipher/token-cipher.ts';

const secret = 'test-secret-that-is-at-least-32-characters';
const cipher = new AesGcmTokenCipher({ secret });
const context = 'user-1:github:access';

describe('AesGcmTokenCipher', () => {
  it('opens what it sealed', () => {
    const sealed = cipher.seal({ plaintext: 'ghu_token', context });

    expect(sealed).toMatch(/^v1\.[\w-]+\.[\w-]+\.[\w-]+$/u);
    expect(sealed).not.toContain('ghu_token');
    expect(cipher.open({ sealed, context })).toBe('ghu_token');
  });

  it('seals the same token differently each time', () => {
    expect(cipher.seal({ plaintext: 'ghu_token', context })).not.toBe(
      cipher.seal({ plaintext: 'ghu_token', context }),
    );
  });

  it('refuses a value moved to another row or column', () => {
    const sealed = cipher.seal({ plaintext: 'ghu_token', context });

    expect(() =>
      cipher.open({ sealed, context: 'user-2:github:access' }),
    ).toThrow(SealedTokenError);
  });

  it('refuses a value sealed under another secret', () => {
    const sealed = new AesGcmTokenCipher({
      secret: 'another-secret-that-is-32-characters-long',
    }).seal({ plaintext: 'ghu_token', context });

    expect(() => cipher.open({ sealed, context })).toThrow(SealedTokenError);
  });

  it('refuses a tampered value', () => {
    const sealed = cipher.seal({ plaintext: 'ghu_token', context });
    const [version, iv, body = '', tag] = sealed.split('.');
    const flipped = `${body.startsWith('A') ? 'B' : 'A'}${body.slice(1)}`;

    expect(() =>
      cipher.open({ sealed: [version, iv, flipped, tag].join('.'), context }),
    ).toThrow(SealedTokenError);
  });

  it('refuses a truncated authentication tag', () => {
    const sealed = cipher.seal({ plaintext: 'ghu_token', context });
    const [version, iv, body, tag = ''] = sealed.split('.');
    const truncated = Buffer.from(tag, 'base64url')
      .subarray(0, 4)
      .toString('base64url');

    expect(() =>
      cipher.open({
        sealed: [version, iv, body, truncated].join('.'),
        context,
      }),
    ).toThrow(SealedTokenError);
  });
});
