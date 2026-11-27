import {
  createCipheriv,
  createDecipheriv,
  hkdfSync,
  randomBytes,
} from 'node:crypto';

import { SealedTokenError } from '#src/connections/errors.ts';

const version = 'v1';
const keyInfo = 'dash/connections/token-cipher/v1';
const ivBytes = 12;
const authTagLength = 16;

/** Encrypts provider tokens before they reach the database. */
export interface TokenCipher {
  /** `context` names the row and column, such as `<user id>:github:access`, so a sealed value can't be moved to another. */
  seal(props: { plaintext: string; context: string }): string;
  /** Throws `SealedTokenError` when the value was altered or sealed for another context or key. */
  open(props: { sealed: string; context: string }): string;
}

/**
 * AES in GCM mode, with a 256-bit key derived with HKDF-SHA256 from Mission Control's auth secret, so no
 * new secret is needed and the key is never the secret itself. Sealed values read
 * `v1.<iv>.<ciphertext>.<tag>` in base64url. Rotating the auth secret makes stored tokens
 * unreadable; people then authorize again.
 */
export class AesGcmTokenCipher implements TokenCipher {
  private readonly key: Buffer;

  constructor(props: { secret: string }) {
    this.key = Buffer.from(
      hkdfSync('sha256', props.secret, Buffer.alloc(0), keyInfo, 32),
    );
  }

  seal(props: { plaintext: string; context: string }): string {
    const iv = randomBytes(ivBytes);
    const cipher = createCipheriv('aes-256-gcm', this.key, iv, {
      authTagLength,
    });
    cipher.setAAD(Buffer.from(props.context, 'utf8'));
    const ciphertext = Buffer.concat([
      cipher.update(props.plaintext, 'utf8'),
      cipher.final(),
    ]);
    const parts = [iv, ciphertext, cipher.getAuthTag()].map((part) =>
      part.toString('base64url'),
    );
    return [version, ...parts].join('.');
  }

  open(props: { sealed: string; context: string }): string {
    try {
      const [prefix, iv, ciphertext, tag, ...rest] = props.sealed.split('.');
      if (
        prefix !== version ||
        iv === undefined ||
        ciphertext === undefined ||
        tag === undefined ||
        rest.length > 0
      ) {
        throw new Error('Not a v1 sealed token');
      }
      const decipher = createDecipheriv(
        'aes-256-gcm',
        this.key,
        Buffer.from(iv, 'base64url'),
        { authTagLength },
      );
      decipher.setAAD(Buffer.from(props.context, 'utf8'));
      decipher.setAuthTag(Buffer.from(tag, 'base64url'));
      return Buffer.concat([
        decipher.update(Buffer.from(ciphertext, 'base64url')),
        decipher.final(),
      ]).toString('utf8');
    } catch (cause) {
      throw new SealedTokenError({ cause });
    }
  }
}
