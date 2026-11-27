import type {
  AuthenticationResponseJSON,
  PublicKeyCredentialCreationOptionsJSON,
  RegistrationResponseJSON,
} from '@simplewebauthn/browser';
import { vi } from 'vitest';
import { HttpPasskeyAuth } from '#lib/auth/passkey-auth.ts';
import type { PasskeyAuthError } from '#lib/auth/passkey-auth-error.ts';
import { passkeyWording } from '#lib/auth/passkey-wording.ts';
import {
  type AddedStep,
  SecondPasskeyFlow,
  type SecondPasskeyStep,
} from '#lib/auth/second-passkey-flow.ts';
import type { WebAuthnCeremonies } from '#lib/auth/web-authn-ceremonies.ts';

export const optionsPath = '/api/auth/passkey/generate-register-options';
export const verifyPath = '/api/auth/passkey/verify-registration';
export const renamePath = '/api/auth/passkey/update-passkey';
export const signInOptionsPath =
  '/api/auth/passkey/generate-authenticate-options';
export const signInPath = '/api/auth/passkey/verify-authentication';

export const phone = {
  id: 'p2',
  name: null,
  createdAt: '2026-11-27T10:00:00.000Z',
  deviceType: 'multiDevice',
  backedUp: true,
};

/** The browser's passkey prompts: they answer, or fail once with `failWith`. */
class FakeCeremonies implements WebAuthnCeremonies {
  readonly registered: PublicKeyCredentialCreationOptionsJSON[] = [];
  failWith: PasskeyAuthError | null = null;

  async register(props: {
    options: PublicKeyCredentialCreationOptionsJSON;
  }): Promise<RegistrationResponseJSON> {
    this.registered.push(props.options);
    this.fail();
    return {
      id: 'credential',
      rawId: 'credential',
      type: 'public-key',
      clientExtensionResults: {},
      response: { clientDataJSON: 'c', attestationObject: 'a' },
    };
  }

  async authenticate(): Promise<AuthenticationResponseJSON> {
    this.fail();
    return {
      id: 'credential',
      rawId: 'credential',
      type: 'public-key',
      clientExtensionResults: {},
      response: { clientDataJSON: 'c', authenticatorData: 'a', signature: 's' },
    };
  }

  private fail(): void {
    const failure = this.failWith;
    this.failWith = null;
    if (failure !== null) throw failure;
  }
}

/** Answers each Mission Control path from a queue; the last answer repeats. */
export class Harness {
  readonly requested: string[] = [];
  readonly bodies: string[] = [];
  readonly ceremonies = new FakeCeremonies();
  readonly flow: SecondPasskeyFlow;
  private readonly queues: Map<string, (() => Response)[]>;

  constructor(answers: Record<string, (() => Response)[]>) {
    this.queues = new Map(Object.entries(answers));
    const fetcher = vi.fn<typeof fetch>(async (input, init) => {
      const url = new URL(String(input));
      this.requested.push(`${url.pathname}${url.search}`);
      this.bodies.push(String(init?.body ?? ''));
      const queue = this.queues.get(url.pathname) ?? [];
      const answer = queue.length > 1 ? queue.shift() : queue[0];
      return answer === undefined
        ? new Response('down', { status: 503 })
        : answer();
    });
    this.flow = new SecondPasskeyFlow({
      auth: new HttpPasskeyAuth({
        baseUrl: 'https://api.example.test',
        fetch: fetcher,
        ceremonies: this.ceremonies,
      }),
      wording: passkeyWording,
    });
  }
}

export class Steps {
  /** Registration options as Mission Control sends them for a passkey on another device. */
  static crossDeviceOptions(): Response {
    return Response.json({
      challenge: 'c',
      user: { id: 'u', name: 'ada@example.com' },
      authenticatorSelection: { authenticatorAttachment: 'cross-platform' },
    });
  }

  static added(step: SecondPasskeyStep): AddedStep {
    if (step.step !== 'added') throw new Error(`at ${step.step}`);
    return step;
  }

  static failure(status: number, code: string): () => Response {
    return () => Response.json({ code, message: code }, { status });
  }
}

/** Answers for one successful add. */
export const adding = {
  [optionsPath]: [Steps.crossDeviceOptions],
  [verifyPath]: [() => Response.json(phone)],
};
