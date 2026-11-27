import type {
  AuthenticationResponseJSON,
  PublicKeyCredentialCreationOptionsJSON,
  RegistrationResponseJSON,
} from '@simplewebauthn/browser';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { HttpPasskeyAuth } from '#lib/auth/passkey-auth.ts';
import { PasskeyAuthError } from '#lib/auth/passkey-auth-error.ts';
import { passkeyWording } from '#lib/auth/passkey-wording.ts';
import {
  type PasskeyStep,
  RecoveryFlow,
  type RecoveryStep,
} from '#lib/auth/recovery-flow.ts';
import type { WebAuthnCeremonies } from '#lib/auth/web-authn-ceremonies.ts';

const redeemPath = '/api/auth/recovery/redeem';
const optionsPath = '/api/auth/passkey/generate-register-options';
const verifyPath = '/api/auth/passkey/verify-registration';

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

let optionsServed = 0;

const answer = {
  enrolment: () => Response.json({ enrolment: 'recovery-enrolment:abc' }),
  options: () => {
    optionsServed += 1;
    return Response.json({
      challenge: `challenge-${optionsServed}`,
      user: { id: 'u', name: 'ada@example.com' },
    });
  },
  ok: () => Response.json({ status: true }),
  failure:
    (status: number, code: string, headers: Record<string, string> = {}) =>
    () =>
      Response.json({ code }, { status, headers }),
};

class Harness {
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

class Steps {
  static passkey(step: RecoveryStep): PasskeyStep {
    if (step.step !== 'passkey') throw new Error(`at ${step.step}`);
    return step;
  }
}

afterEach(() => {
  vi.useRealTimers();
  optionsServed = 0;
});

describe('RecoveryFlow with a code', () => {
  it('names the account before the ceremony, then registers and signs in', async () => {
    const harness = new Harness({
      [redeemPath]: [answer.enrolment],
      [optionsPath]: [answer.options],
      [verifyPath]: [answer.ok],
    });

    const passkey = Steps.passkey(
      await harness.flow.redeem({
        email: ' ada@example.com ',
        code: ' k7m2-q9xp ',
      }),
    );
    expect(passkey).toMatchObject({
      source: 'code',
      error: null,
      prepared: { account: 'ada@example.com' },
    });
    expect(harness.ceremonies.challenges).toEqual([]);

    await expect(harness.flow.register(passkey)).resolves.toEqual({
      step: 'done',
    });
    expect(harness.missionControl.requested).toEqual([
      redeemPath,
      `${optionsPath}?context=recovery-enrolment%3Aabc`,
      verifyPath,
    ]);
  });

  it('marks both fields for a refused code, without asking for options', async () => {
    const harness = new Harness({
      [redeemPath]: [answer.failure(401, 'RECOVERY_REJECTED')],
    });

    const step = await harness.flow.redeem({ email: 'a@b.c', code: 'x' });

    expect(step).toEqual({
      step: 'code',
      problem: {
        message: passkeyWording.explain(
          new PasskeyAuthError({ code: 'RECOVERY_REJECTED', status: 401 }),
        ),
        rejected: true,
        retryAt: null,
      },
    });
    expect(harness.missionControl.requested).toEqual([redeemPath]);
  });
});

describe('RecoveryFlow after too many tries', () => {
  it('holds the form for Mission Control’s Retry-After after too many tries', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-11-27T10:00:00Z'));
    const harness = new Harness({
      [redeemPath]: [
        answer.failure(429, 'RECOVERY_RATE_LIMITED', { 'retry-after': '840' }),
      ],
    });

    const step = await harness.flow.redeem({ email: 'a@b.c', code: 'x' });

    expect(step).toMatchObject({
      step: 'code',
      problem: {
        message: 'Too many tries. Try again in 14 minutes.',
        rejected: false,
      },
    });
    expect(RecoveryFlow.waitMs(step, Date.now())).toBe(840_000);
    vi.advanceTimersByTime(839_000);
    expect(RecoveryFlow.waitMs(step, Date.now())).toBe(1000);
    vi.advanceTimersByTime(1000);
    expect(RecoveryFlow.waitMs(step, Date.now())).toBe(0);
  });

  it('asks for a short wait when the browser can’t read Retry-After', async () => {
    const harness = new Harness({
      [redeemPath]: [answer.failure(429, 'RECOVERY_RATE_LIMITED')],
    });

    const step = await harness.flow.redeem({ email: 'a@b.c', code: 'x' });

    expect(step).toMatchObject({
      step: 'code',
      problem: {
        message: 'Too many tries. Wait a few minutes, then try again.',
        retryAt: null,
      },
    });
    expect(RecoveryFlow.waitMs(step, Date.now())).toBe(0);
  });
});

describe('RecoveryFlow at the passkey step', () => {
  it('sends an expired enrolment back to the code, which wasn’t spent', async () => {
    const harness = new Harness({
      [redeemPath]: [answer.enrolment],
      [optionsPath]: [answer.options],
      [verifyPath]: [answer.failure(401, 'PASSKEY_ENROLMENT_REJECTED')],
    });
    const passkey = Steps.passkey(
      await harness.flow.redeem({ email: 'a@b.c', code: 'x' }),
    );

    const step = await harness.flow.register(passkey);

    expect(step).toEqual({
      step: 'code',
      problem: {
        message:
          'That took too long, so your code wasn’t used. Enter it again to continue.',
        rejected: false,
        retryAt: null,
      },
    });
  });

  it('stays on the passkey step with fresh options after a cancelled or failed prompt', async () => {
    const harness = new Harness({
      [redeemPath]: [answer.enrolment],
      [optionsPath]: [answer.options],
      [verifyPath]: [answer.ok],
    });
    const passkey = Steps.passkey(
      await harness.flow.redeem({ email: 'a@b.c', code: 'x' }),
    );

    harness.ceremonies.failWith = new PasskeyAuthError({
      code: 'ERROR_CEREMONY_ABORTED',
      status: 0,
    });
    const cancelled = Steps.passkey(await harness.flow.register(passkey));
    harness.ceremonies.failWith = new PasskeyAuthError({
      code: 'NotAllowedError',
      status: 0,
    });
    const closed = Steps.passkey(await harness.flow.register(cancelled));

    expect(cancelled.error).toBeNull();
    expect(closed.error).toBe(
      'The passkey prompt was closed or timed out. Try again.',
    );
    expect(harness.ceremonies.challenges).toEqual([
      'challenge-1',
      'challenge-2',
    ]);
    expect(closed.prepared.options.challenge).toBe('challenge-3');
    await expect(harness.flow.register(closed)).resolves.toEqual({
      step: 'done',
    });
  });
});

describe('RecoveryFlow with a break-glass link', () => {
  it('reads the enrolment from the fragment', async () => {
    const harness = new Harness({ [optionsPath]: [answer.options] });

    const step = await harness.flow.openLink({
      hash: '#enrolment=recovery-enrolment%3Axyz',
    });

    expect(step).toMatchObject({
      step: 'passkey',
      source: 'link',
      enrolment: 'recovery-enrolment:xyz',
      prepared: { account: 'ada@example.com' },
    });
    expect(harness.missionControl.requested).toEqual([
      `${optionsPath}?context=recovery-enrolment%3Axyz`,
    ]);
  });

  it.each(['', '#', '#enrolment=', '#other=1'])(
    'calls %j an incomplete link without asking Mission Control',
    async (hash) => {
      const harness = new Harness({});

      await expect(harness.flow.openLink({ hash })).resolves.toEqual({
        step: 'link-missing',
      });
      expect(harness.missionControl.requested).toEqual([]);
    },
  );

  it('calls a link expired when Mission Control rejects it, before or after the ceremony', async () => {
    const before = new Harness({
      [optionsPath]: [answer.failure(401, 'PASSKEY_ENROLMENT_REJECTED')],
    });
    const after = new Harness({
      [optionsPath]: [answer.options],
      [verifyPath]: [answer.failure(401, 'PASSKEY_ENROLMENT_REJECTED')],
    });

    await expect(
      before.flow.openLink({ hash: '#enrolment=e' }),
    ).resolves.toEqual({ step: 'link-expired' });
    const passkey = Steps.passkey(
      await after.flow.openLink({ hash: '#enrolment=e' }),
    );
    await expect(after.flow.register(passkey)).resolves.toEqual({
      step: 'link-expired',
    });
  });

  it('keeps the enrolment to try again when Mission Control is down', async () => {
    const harness = new Harness({
      [optionsPath]: [
        () => new Response('down', { status: 503 }),
        answer.options,
      ],
    });

    const down = await harness.flow.openLink({ hash: '#enrolment=e' });

    expect(down).toMatchObject({ step: 'link-unavailable', enrolment: 'e' });
    await expect(
      harness.flow.retryLink({ enrolment: 'e' }),
    ).resolves.toMatchObject({ step: 'passkey', source: 'link' });
  });
});
