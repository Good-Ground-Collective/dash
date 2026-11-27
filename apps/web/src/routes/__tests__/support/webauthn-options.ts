import { randomBytes } from 'node:crypto';

/** WebAuthn options shaped like Mission Control's passkey plugin sends them, for the stubs. */
export class WebAuthnOptions {
  static registration(props: {
    email: string;
    name: string;
    /** The person's passkeys, which the browser won't register again. */
    passkeys: readonly { credentialId: string }[];
    /** Better Auth's `authenticatorAttachment` query, when the page sent one. */
    attachment?: string | null;
  }) {
    return {
      challenge: randomBytes(32).toString('base64url'),
      rp: { name: 'Dash', id: 'localhost' },
      user: {
        id: randomBytes(16).toString('base64url'),
        name: props.email,
        displayName: props.name,
      },
      pubKeyCredParams: [{ type: 'public-key', alg: -7 }],
      timeout: 60_000,
      attestation: 'none',
      excludeCredentials: props.passkeys.map(({ credentialId }) => ({
        id: credentialId,
        type: 'public-key',
      })),
      authenticatorSelection: {
        residentKey: 'required',
        userVerification: 'required',
        authenticatorAttachment: props.attachment ?? undefined,
      },
    };
  }

  static authentication() {
    return {
      challenge: randomBytes(32).toString('base64url'),
      rpId: 'localhost',
      timeout: 60_000,
      userVerification: 'required',
      allowCredentials: [],
    };
  }
}
