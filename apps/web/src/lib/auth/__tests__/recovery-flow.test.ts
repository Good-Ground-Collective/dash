import { afterEach, describe, expect, it, vi } from 'vitest';
import { PasskeyAuthError } from '#lib/auth/passkey-auth-error.ts';
import { passkeyWording } from '#lib/auth/passkey-wording.ts';
import { RecoveryFlow } from '#lib/auth/recovery-flow.ts';
import {
  Answer,
  Harness,
  optionsPath,
  redeemPath,
  signOutPath,
  Steps,
  verifyPath,
} from './support/recovery-harness.ts';

afterEach(() => {
  vi.useRealTimers();
  Answer.reset();
});

describe('RecoveryFlow with a code', () => {
  it('names the account before the ceremony, then registers and signs in', async () => {
    const harness = new Harness({
      [redeemPath]: [Answer.enrolment],
      [optionsPath]: [Answer.options],
      [verifyPath]: [Answer.ok],
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
      [redeemPath]: [Answer.failure(401, 'RECOVERY_REJECTED')],
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
        Answer.failure(429, 'RECOVERY_RATE_LIMITED', { 'retry-after': '840' }),
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
      [redeemPath]: [Answer.failure(429, 'RECOVERY_RATE_LIMITED')],
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
      [redeemPath]: [Answer.enrolment],
      [optionsPath]: [Answer.options],
      [verifyPath]: [Answer.failure(401, 'PASSKEY_ENROLMENT_REJECTED')],
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
      [redeemPath]: [Answer.enrolment],
      [optionsPath]: [Answer.options],
      [verifyPath]: [Answer.ok],
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
    const harness = new Harness({ [optionsPath]: [Answer.options] });

    const step = await harness.flow.openLink({
      viewer: null,
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

      await expect(
        harness.flow.openLink({ viewer: null, hash }),
      ).resolves.toEqual({
        step: 'link-missing',
      });
      expect(harness.missionControl.requested).toEqual([]);
    },
  );

  it('calls a link expired when Mission Control rejects it, before or after the ceremony', async () => {
    const before = new Harness({
      [optionsPath]: [Answer.failure(401, 'PASSKEY_ENROLMENT_REJECTED')],
    });
    const after = new Harness({
      [optionsPath]: [Answer.options],
      [verifyPath]: [Answer.failure(401, 'PASSKEY_ENROLMENT_REJECTED')],
    });

    await expect(
      before.flow.openLink({ viewer: null, hash: '#enrolment=e' }),
    ).resolves.toEqual({ step: 'link-expired' });
    const passkey = Steps.passkey(
      await after.flow.openLink({ viewer: null, hash: '#enrolment=e' }),
    );
    await expect(after.flow.register(passkey)).resolves.toEqual({
      step: 'link-expired',
    });
  });
});

describe('RecoveryFlow with a break-glass link Mission Control can’t answer', () => {
  it('keeps the enrolment to try again when Mission Control is down', async () => {
    const harness = new Harness({
      [optionsPath]: [Answer.down, Answer.options],
    });

    const down = await harness.flow.openLink({
      viewer: null,
      hash: '#enrolment=e',
    });

    expect(down).toMatchObject({
      step: 'unavailable',
      source: 'link',
      enrolment: 'e',
    });
    await expect(
      harness.flow.retry(Steps.unavailable(down)),
    ).resolves.toMatchObject({ step: 'passkey', source: 'link' });
  });
});

describe('RecoveryFlow with a break-glass link and someone signed in', () => {
  it('stops before Mission Control hears about the enrolment', async () => {
    const harness = new Harness({});

    const step = await harness.flow.openLink({
      viewer: 'grace@example.com',
      hash: '#enrolment=recovery-enrolment%3Axyz',
    });

    expect(step).toEqual({
      step: 'signed-in',
      account: 'grace@example.com',
      enrolment: 'recovery-enrolment:xyz',
    });
    expect(harness.missionControl.requested).toEqual([]);
  });

  it('signs out, then asks for options with the kept enrolment', async () => {
    const harness = new Harness({
      [signOutPath]: [Answer.ok],
      [optionsPath]: [Answer.options],
    });

    const step = await harness.flow.signOutAndContinue({
      step: 'signed-in',
      account: 'grace@example.com',
      enrolment: 'recovery-enrolment:xyz',
    });

    expect(step).toMatchObject({ step: 'passkey', source: 'link' });
    expect(harness.missionControl.requested).toEqual([
      signOutPath,
      `${optionsPath}?context=recovery-enrolment%3Axyz`,
    ]);
  });
});

describe('RecoveryFlow when options can’t be had', () => {
  it('keeps an accepted code’s enrolment to try again, without redeeming twice', async () => {
    const harness = new Harness({
      [redeemPath]: [Answer.enrolment],
      [optionsPath]: [Answer.down, Answer.options],
    });

    const down = await harness.flow.redeem({ email: 'a@b.c', code: 'x' });
    const retried = await harness.flow.retry(Steps.unavailable(down));

    expect(down).toMatchObject({
      step: 'unavailable',
      source: 'code',
      enrolment: 'recovery-enrolment:abc',
    });
    expect(retried).toMatchObject({ step: 'passkey', source: 'code' });
    expect(
      harness.missionControl.requested.filter((path) => path === redeemPath),
    ).toHaveLength(1);
  });

  it.each([{ id: 'u' }, { id: 'u', name: '' }, { id: 'u', name: '   ' }])(
    'won’t reach the passkey step when the options name no account (%j)',
    async (user) => {
      const harness = new Harness({
        [optionsPath]: [() => Response.json({ challenge: 'c', user })],
      });

      const step = await harness.flow.openLink({
        viewer: null,
        hash: '#enrolment=e',
      });

      expect(step).toMatchObject({
        step: 'unavailable',
        error: passkeyWording.explain(
          new PasskeyAuthError({
            code: 'ENROLMENT_ACCOUNT_MISSING',
            status: 0,
          }),
        ),
      });
      expect(harness.ceremonies.challenges).toEqual([]);
    },
  );
});
