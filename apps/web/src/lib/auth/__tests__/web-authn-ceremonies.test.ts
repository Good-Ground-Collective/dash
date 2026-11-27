import { WebAuthnError } from '@simplewebauthn/browser';
import { describe, expect, it } from 'vitest';
import { BrowserWebAuthnCeremonies } from '#lib/auth/web-authn-ceremonies.ts';

describe('BrowserWebAuthnCeremonies.failure', () => {
  it('names a passed-through browser error by its cause, such as a closed prompt', () => {
    const error = BrowserWebAuthnCeremonies.failure(
      new WebAuthnError({
        message: 'The operation either timed out or was not allowed.',
        code: 'ERROR_PASSTHROUGH_SEE_CAUSE_PROPERTY',
        cause: new DOMException('closed', 'NotAllowedError'),
      }),
    );

    expect(error.code).toBe('NotAllowedError');
  });

  it('keeps SimpleWebAuthn’s own codes', () => {
    const error = BrowserWebAuthnCeremonies.failure(
      new WebAuthnError({
        message: 'aborted',
        code: 'ERROR_CEREMONY_ABORTED',
        cause: new DOMException('aborted', 'AbortError'),
      }),
    );

    expect(error.code).toBe('ERROR_CEREMONY_ABORTED');
  });

  it('calls anything else a failed ceremony, keeping its message', () => {
    const error = BrowserWebAuthnCeremonies.failure(
      new Error('WebAuthn is not supported in this browser'),
    );

    expect(error.code).toBe('CEREMONY_FAILED');
    expect(error.message).toBe('WebAuthn is not supported in this browser');
  });
});
