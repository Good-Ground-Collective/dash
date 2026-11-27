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
  type PasskeyStep,
  RecoveryFlow,
  type RecoveryStep,
  type UnavailableStep,
} from '#lib/auth/recovery-flow.ts';
import type { WebAuthnCeremonies } from '#lib/auth/web-authn-ceremonies.ts';

export const redeemPath = '/api/auth/recovery/redeem';
export const optionsPath = '/api/auth/passkey/generate-register-options';
export const verifyPath = '/api/auth/passkey/verify-registration';
export const signOutPath = '/api/auth/sign-out';

/** The browser's passkey prompt: answers, or fails with `failWith` once. */
class FakeCeremonies implements WebAuthnCeremonies {
  readonly challenges: string[] = [];
  failWith: PasskeyAuthError | null = null;

  async register(props: {
    options: PublicKeyCredentialCreationOptionsJSON;
  }): Promise<RegistrationResponseJSON> {
    this.challenges.push(props.options.challenge);
    const failure = this.failWith;
    this.failWith = null;
    if (failure !== null) throw failure;
    return {
      id: 'credential',
      rawId: 'credential',
      type: 'public-key',
      clientExtensionResults: {},
      response: { clientDataJSON: 'c', attestationObject: 'a' },
    };
  }

  async authenticate(): Promise<AuthenticationResponseJSON> {
    return {
      id: 'credential',
      rawId: 'credential',
      type: 'public-key',
      clientExtensionResults: {},
      response: { clientDataJSON: 'c', authenticatorData: 'a', signature: 's' },
    };
  }
}

/** A `fetch` mock answering each Mission Control path from a queue; the last answer repeats. */
class MissionControlAnswers {
  readonly requested: string[] = [];
  readonly fetch = vi.fn<typeof fetch>(async (input) => {
    const url = new URL(String(input));
    this.requested.push(`${url.pathname}${url.search}`);
    const queue = this.queues.get(url.pathname) ?? [];
    const answer = queue.length > 1 ? queue.shift() : queue[0];
    return answer === undefined
      ? new Response('down', { status: 503 })
      : answer();
  });

  private readonly queues: Map<string, (() => Response)[]>;

  constructor(answers: Record<string, (() => Response)[]>) {
    this.queues = new Map(Object.entries(answers));
  }
}

const served = { options: 0 };

/** Canned Mission Control answers. Each set of options carries a new challenge, counted per test. */
export class Answer {
  static enrolment(): Response {
    return Response.json({ enrolment: 'recovery-enrolment:abc' });
  }

  static options(): Response {
    served.options += 1;
    return Response.json({
      challenge: `challenge-${served.options}`,
      user: { id: 'u', name: 'ada@example.com' },
    });
  }

  static ok(): Response {
    return Response.json({ status: true });
  }

  static down(): Response {
    return new Response('down', { status: 503 });
  }

  static failure(
    status: number,
    code: string,
    headers: Record<string, string> = {},
  ): () => Response {
    return () => Response.json({ code }, { status, headers });
  }

  static reset(): void {
    served.options = 0;
  }
}

/** A `RecoveryFlow` over the real `HttpPasskeyAuth`, a fetch mock and a fake passkey prompt. */
export class Harness {
  readonly ceremonies = new FakeCeremonies();
  readonly missionControl: MissionControlAnswers;
  readonly flow: RecoveryFlow;

  constructor(answers: Record<string, (() => Response)[]>) {
    this.missionControl = new MissionControlAnswers(answers);
    this.flow = new RecoveryFlow({
      auth: new HttpPasskeyAuth({
        baseUrl: 'https://api.dash.doublel.studio',
        fetch: this.missionControl.fetch,
        ceremonies: this.ceremonies,
      }),
      wording: passkeyWording,
    });
  }
}

export class Steps {
  static passkey(step: RecoveryStep): PasskeyStep {
    if (step.step !== 'passkey') throw new Error(`at ${step.step}`);
    return step;
  }

  static unavailable(step: RecoveryStep): UnavailableStep {
    if (step.step !== 'unavailable') throw new Error(`at ${step.step}`);
    return step;
  }
}
