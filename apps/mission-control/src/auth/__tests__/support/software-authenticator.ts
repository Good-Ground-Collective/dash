import {
  createHash,
  generateKeyPairSync,
  type KeyObject,
  randomBytes,
  sign,
} from 'node:crypto';

import type {
  AuthenticationResponseJSON,
  RegistrationResponseJSON,
} from '@simplewebauthn/server';
import { isoCBOR } from '@simplewebauthn/server/helpers';
import { z } from 'zod';

const coseKeyType = 1;
const coseAlgorithm = 3;
const coseCurve = -1;
const coseX = -2;
const coseY = -3;
const ec2KeyType = 2;
const es256 = -7;
const p256 = 1;

const userPresent = 0x01;
const userVerified = 0x04;
const attestedCredentialData = 0x40;

/** The part of WebAuthn creation or request options the authenticator signs over. */
export const ceremonyOptionsSchema = z.object({ challenge: z.string() });

export type CeremonyOptions = z.infer<typeof ceremonyOptionsSchema>;

const publicJwkSchema = z.object({ x: z.string(), y: z.string() });

interface SoftwareCredential {
  id: string;
  privateKey: KeyObject;
  publicKey: KeyObject;
}

/** A platform authenticator in software: each registration mints a discoverable ES256 credential, and sign-in uses the first. */
export class SoftwareAuthenticator {
  private readonly origin: string;
  private readonly rpId: string;
  private readonly credentials: SoftwareCredential[] = [];
  private signCount = 0;

  constructor(props: { origin: string }) {
    this.origin = props.origin;
    this.rpId = new URL(props.origin).hostname;
  }

  /** Answers `navigator.credentials.create()` for the given registration options. */
  register(options: CeremonyOptions): RegistrationResponseJSON {
    const { challenge } = options;
    const credential = {
      id: randomBytes(16).toString('base64url'),
      ...generateKeyPairSync('ec', { namedCurve: 'P-256' }),
    };
    this.credentials.push(credential);
    const jwk = publicJwkSchema.parse(
      credential.publicKey.export({ format: 'jwk' }),
    );
    const coseKey = isoCBOR.encode(
      new Map<number, number | Uint8Array>([
        [coseKeyType, ec2KeyType],
        [coseAlgorithm, es256],
        [coseCurve, p256],
        [coseX, Buffer.from(jwk.x, 'base64url')],
        [coseY, Buffer.from(jwk.y, 'base64url')],
      ]),
    );
    const credentialId = Buffer.from(credential.id, 'base64url');
    const length = Buffer.alloc(2);
    length.writeUInt16BE(credentialId.length);

    const authenticatorData = Buffer.concat([
      this.authenticatorHeader(
        userPresent | userVerified | attestedCredentialData,
      ),
      Buffer.alloc(16),
      length,
      credentialId,
      coseKey,
    ]);
    const attestationObject = isoCBOR.encode(
      new Map<string, string | Uint8Array | Map<string, string>>([
        ['fmt', 'none'],
        ['attStmt', new Map<string, string>()],
        ['authData', authenticatorData],
      ]),
    );

    return {
      id: credential.id,
      rawId: credential.id,
      type: 'public-key',
      authenticatorAttachment: 'platform',
      clientExtensionResults: {},
      response: {
        clientDataJSON: this.clientData({ type: 'webauthn.create', challenge }),
        attestationObject: Buffer.from(attestationObject).toString('base64url'),
        transports: ['internal'],
      },
    };
  }

  /** Answers `navigator.credentials.get()` for the given authentication options. */
  authenticate(options: CeremonyOptions): AuthenticationResponseJSON {
    const { challenge } = options;
    const [credential] = this.credentials;
    if (credential === undefined) {
      throw new Error('Register a passkey before signing in with it');
    }
    const clientDataJSON = this.clientData({ type: 'webauthn.get', challenge });
    const authenticatorData = this.authenticatorHeader(
      userPresent | userVerified,
    );
    const signature = sign(
      'sha256',
      Buffer.concat([
        authenticatorData,
        createHash('sha256')
          .update(Buffer.from(clientDataJSON, 'base64url'))
          .digest(),
      ]),
      credential.privateKey,
    );

    return {
      id: credential.id,
      rawId: credential.id,
      type: 'public-key',
      authenticatorAttachment: 'platform',
      clientExtensionResults: {},
      response: {
        clientDataJSON,
        authenticatorData: authenticatorData.toString('base64url'),
        signature: signature.toString('base64url'),
      },
    };
  }

  private authenticatorHeader(flags: number): Buffer {
    this.signCount += 1;
    const counter = Buffer.alloc(4);
    counter.writeUInt32BE(this.signCount);
    return Buffer.concat([
      createHash('sha256').update(this.rpId).digest(),
      Buffer.from([flags]),
      counter,
    ]);
  }

  private clientData(props: { type: string; challenge: string }): string {
    return Buffer.from(
      JSON.stringify({
        type: props.type,
        challenge: props.challenge,
        origin: this.origin,
        crossOrigin: false,
      }),
    ).toString('base64url');
  }
}
