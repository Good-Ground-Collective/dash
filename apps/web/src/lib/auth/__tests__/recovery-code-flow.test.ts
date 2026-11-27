import type {
  AuthenticationResponseJSON,
  RegistrationResponseJSON,
} from '@simplewebauthn/browser';
import { describe, expect, it, vi } from 'vitest';
import { HttpPasskeyAuth } from '#lib/auth/passkey-auth.ts';
import { PasskeyAuthError } from '#lib/auth/passkey-auth-error.ts';
import { passkeyWording } from '#lib/auth/passkey-wording.ts';
import {
  RecoveryCodeFlow,
  type RecoveryCodeStep,
  type SavingStep,
} from '#lib/auth/recovery-code-flow.ts';
import { HttpRecoveryCodes } from '#lib/auth/recovery-codes.ts';
import type { WebAuthnCeremonies } from '#lib/auth/web-authn-ceremonies.ts';

const generatePath = '/api/auth/recovery-codes/generate';
const confirmPath = '/api/auth/recovery-codes/confirm';
const signInOptionsPath = '/api/auth/passkey/generate-authenticate-options';
const signInPath = '/api/auth/passkey/verify-authentication';

const codes = Array.from({ length: 10 }, (_, index) => `abcd-${1000 + index}`);

/** The browser's passkey prompt: answers, or fails with `failWith`. */
class FakeCeremonies implements WebAuthnCeremonies {
  failWith: PasskeyAuthError | null = null;

  async register(): Promise<RegistrationResponseJSON> {
    return Promise.reject(new Error('Codes never register a passkey'));
  }

  async authenticate(): Promise<AuthenticationResponseJSON> {
    if (this.failWith !== null) throw this.failWith;
    return {
      id: 'credential',
      rawId: 'credential',
      type: 'public-key',
      clientExtensionResults: {},
      response: { clientDataJSON: 'c', authenticatorData: 'a', signature: 's' },
    };
  }
}

/** Answers each Mission Control path from a queue; the last answer repeats. */
class Harness {
  readonly requested: string[] = [];
  readonly bodies: string[] = [];
  readonly ceremonies = new FakeCeremonies();
  readonly flow: RecoveryCodeFlow;
  private readonly queues: Map<string, (() => Response)[]>;

  constructor(answers: Record<string, (() => Response)[]>) {
    this.queues = new Map(Object.entries(answers));
    const fetcher = vi.fn<typeof fetch>(async (input, init) => {
      const path = new URL(String(input)).pathname;
      this.requested.push(path);
      this.bodies.push(String(init?.body ?? ''));
      const queue = this.queues.get(path) ?? [];
      const answer = queue.length > 1 ? queue.shift() : queue[0];
      return answer === undefined
        ? new Response('down', { status: 503 })
        : answer();
    });
    const baseUrl = 'https://api.example.test';
    this.flow = new RecoveryCodeFlow({
      codes: new HttpRecoveryCodes({ baseUrl, fetch: fetcher }),
      auth: new HttpPasskeyAuth({
        baseUrl,
        fetch: fetcher,
        ceremonies: this.ceremonies,
      }),
      wording: passkeyWording,
    });
  }
}

/** Canned Mission Control answers. */
class Answer {
  static set(setId: string): () => Response {
    return () => Response.json({ setId, codes });
  }

  static failure(status: number, code: string): () => Response {
    return () => Response.json({ code, message: code }, { status });
  }

  static authenticationOptions(): Response {
    return Response.json({ challenge: 'c', rpId: 'localhost' });
  }
}

class Steps {
  static saving(step: RecoveryCodeStep): SavingStep {
    if (step.step !== 'saving') throw new Error(`at ${step.step}`);
    return step;
  }
}

describe('RecoveryCodeFlow generating', () => {
  it('shows a new set to save', async () => {
    const harness = new Harness({ [generatePath]: [Answer.set('s1')] });

    await expect(harness.flow.generate()).resolves.toEqual({
      step: 'saving',
      set: { setId: 's1', codes },
      error: null,
    });
  });

  it('asks for a passkey when the sign-in is too old, then makes the set', async () => {
    const harness = new Harness({
      [generatePath]: [
        Answer.failure(403, 'SESSION_NOT_FRESH'),
        Answer.set('s1'),
      ],
      [signInOptionsPath]: [Answer.authenticationOptions],
      [signInPath]: [() => Response.json({ session: {} })],
    });

    await expect(harness.flow.generate()).resolves.toEqual({
      step: 'reauth',
      error: null,
    });
    expect(Steps.saving(await harness.flow.reauthenticate()).set.setId).toBe(
      's1',
    );
    expect(harness.requested).toEqual([
      generatePath,
      signInOptionsPath,
      signInPath,
      generatePath,
    ]);
  });

  it('stays on the passkey check, quietly, when the prompt is dismissed', async () => {
    const harness = new Harness({
      [signInOptionsPath]: [Answer.authenticationOptions],
    });
    harness.ceremonies.failWith = new PasskeyAuthError({
      code: 'ERROR_CEREMONY_ABORTED',
      status: 0,
    });

    await expect(harness.flow.reauthenticate()).resolves.toEqual({
      step: 'reauth',
      error: null,
    });
    expect(harness.requested).not.toContain(generatePath);
  });
});

describe('RecoveryCodeFlow failing to generate', () => {
  it('offers to try again when Mission Control is down', async () => {
    const harness = new Harness({});

    await expect(harness.flow.generate()).resolves.toEqual({
      step: 'failed',
      error: 'Mission Control didn’t make your codes. Try again.',
    });
  });

  it('refuses a set that isn’t ten codes', async () => {
    const harness = new Harness({
      [generatePath]: [() => Response.json({ setId: 's1', codes: ['one'] })],
    });

    await expect(harness.flow.generate()).resolves.toMatchObject({
      step: 'failed',
    });
  });
});

describe('RecoveryCodeFlow confirming', () => {
  it('confirms the shown set by its id', async () => {
    const harness = new Harness({
      [generatePath]: [Answer.set('s1')],
      [confirmPath]: [() => Response.json({ confirmed: true, remaining: 10 })],
    });
    const shown = Steps.saving(await harness.flow.generate());

    await expect(harness.flow.confirm(shown)).resolves.toEqual({
      step: 'confirmed',
      remaining: 10,
    });
    expect(harness.bodies.at(-1)).toBe(JSON.stringify({ setId: 's1' }));
  });

  it('shows a new set when a later one replaced the shown set', async () => {
    const harness = new Harness({
      [generatePath]: [Answer.set('s1'), Answer.set('s2')],
      [confirmPath]: [Answer.failure(409, 'RECOVERY_CODE_SET_NOT_PENDING')],
    });
    const shown = Steps.saving(await harness.flow.generate());

    const next = Steps.saving(await harness.flow.confirm(shown));

    expect(next.set.setId).toBe('s2');
    expect(next.error).toMatch(/Newer codes replaced those/u);
  });

  it('keeps the shown set with an error when confirming fails', async () => {
    const harness = new Harness({ [generatePath]: [Answer.set('s1')] });
    const shown = Steps.saving(await harness.flow.generate());

    await expect(harness.flow.confirm(shown)).resolves.toEqual({
      ...shown,
      error: 'Mission Control didn’t save that. Try again.',
    });
  });
});

describe('RecoveryCodeFlow wording', () => {
  it('writes the codes one per line for Copy and Download', () => {
    const lines = RecoveryCodeFlow.text({ setId: 's1', codes }).split('\n');

    expect(lines[0]).toBe('Dash recovery codes');
    expect(lines.filter((line) => codes.includes(line))).toEqual(codes);
  });

  it('counts what’s left and nudges at two or fewer', () => {
    expect(RecoveryCodeFlow.remaining(10)).toBe('10 of 10 codes left');
    expect(RecoveryCodeFlow.remaining(1)).toBe('1 of 10 codes left');
    expect(RecoveryCodeFlow.isRunningLow(3)).toBe(false);
    expect(RecoveryCodeFlow.isRunningLow(2)).toBe(true);
  });
});
