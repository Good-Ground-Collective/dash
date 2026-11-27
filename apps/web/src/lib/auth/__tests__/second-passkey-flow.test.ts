import { describe, expect, it } from 'vitest';
import type { Passkey } from '#lib/api/mission-control.ts';
import { PasskeyAuthError } from '#lib/auth/passkey-auth-error.ts';
import {
  SecondPasskeyFlow,
  type SecondPasskeyStep,
} from '#lib/auth/second-passkey-flow.ts';
import {
  adding,
  Harness,
  optionsPath,
  phone,
  renamePath,
  signInOptionsPath,
  signInPath,
  Steps,
  verifyPath,
} from './support/second-passkey-harness.ts';

describe('SecondPasskeyFlow adding', () => {
  it('asks for a passkey on another device, with the hybrid hint, and returns it', async () => {
    const harness = new Harness(adding);

    const added = Steps.added(await harness.flow.add());

    expect(added).toMatchObject({ named: false, error: null });
    expect(added.passkey).toMatchObject({ id: 'p2', name: null });
    expect(harness.requested).toEqual([
      `${optionsPath}?authenticatorAttachment=cross-platform`,
      verifyPath,
    ]);
    expect(harness.ceremonies.registered[0]?.hints).toEqual(['hybrid']);
  });

  it('goes back to the offer, quietly, when the prompt is dismissed', async () => {
    const harness = new Harness(adding);
    harness.ceremonies.failWith = new PasskeyAuthError({
      code: 'ERROR_CEREMONY_ABORTED',
      status: 0,
    });

    await expect(harness.flow.add()).resolves.toEqual({
      step: 'offer',
      error: null,
    });
    expect(harness.requested).toEqual([
      `${optionsPath}?authenticatorAttachment=cross-platform`,
    ]);
  });

  it('says so when the prompt was closed or timed out', async () => {
    const harness = new Harness(adding);
    harness.ceremonies.failWith = new PasskeyAuthError({
      code: 'NotAllowedError',
      status: 0,
    });

    await expect(harness.flow.add()).resolves.toEqual({
      step: 'offer',
      error: 'The passkey prompt was closed or timed out. Try again.',
    });
  });
});

describe('SecondPasskeyFlow passkey check', () => {
  it('asks for a passkey sign-in when the session is too old, then adds', async () => {
    const harness = new Harness({
      ...adding,
      [optionsPath]: [
        Steps.failure(403, 'SESSION_NOT_FRESH'),
        Steps.crossDeviceOptions,
      ],
      [signInOptionsPath]: [() => Response.json({ challenge: 'c' })],
      [signInPath]: [() => Response.json({ session: {} })],
    });

    await expect(harness.flow.add()).resolves.toEqual({
      step: 'reauth',
      error: null,
    });
    expect(Steps.added(await harness.flow.reauthenticate()).passkey.id).toBe(
      'p2',
    );
    expect(harness.requested.map((path) => path.split('?')[0])).toEqual([
      optionsPath,
      signInOptionsPath,
      signInPath,
      optionsPath,
      verifyPath,
    ]);
  });

  it('stays on the passkey check, quietly, when its prompt is dismissed', async () => {
    const harness = new Harness({
      [signInOptionsPath]: [() => Response.json({ challenge: 'c' })],
    });
    harness.ceremonies.failWith = new PasskeyAuthError({
      code: 'AbortError',
      status: 0,
    });

    await expect(harness.flow.reauthenticate()).resolves.toEqual({
      step: 'reauth',
      error: null,
    });
  });
});

describe('SecondPasskeyFlow naming', () => {
  it('renames the new passkey with the trimmed name', async () => {
    const harness = new Harness({
      ...adding,
      [renamePath]: [() => Response.json({ passkey: phone })],
    });
    const added = Steps.added(await harness.flow.add());

    const named = Steps.added(await harness.flow.name(added, '  Phone '));

    expect(named).toMatchObject({ named: true, error: null });
    expect(named.passkey.name).toBe('Phone');
    expect(JSON.parse(harness.bodies.at(-1) ?? '{}')).toEqual({
      id: 'p2',
      name: 'Phone',
    });
  });

  it('keeps the form with an error when Mission Control refuses', async () => {
    const harness = new Harness({
      ...adding,
      [renamePath]: [Steps.failure(404, 'PASSKEY_NOT_FOUND')],
    });
    const added = Steps.added(await harness.flow.add());

    await expect(harness.flow.name(added, 'Phone')).resolves.toEqual({
      ...added,
      error: 'That passkey isn’t registered with Dash.',
    });
  });
});

describe('SecondPasskeyFlow blank names', () => {
  it('asks for a name instead of saving one that is only spaces', async () => {
    const harness = new Harness(adding);
    const added = Steps.added(await harness.flow.add());

    await expect(harness.flow.name(added, '   ')).resolves.toEqual({
      ...added,
      error: 'Enter a name for the passkey.',
    });
    expect(harness.requested).not.toContain(renamePath);
  });
});

describe('SecondPasskeyFlow naming after a passkey check', () => {
  it('asks for a passkey sign-in when the session is too old, then saves the name', async () => {
    const harness = new Harness({
      ...adding,
      [renamePath]: [
        Steps.failure(403, 'SESSION_NOT_FRESH'),
        () => Response.json({ passkey: phone }),
      ],
      [signInOptionsPath]: [() => Response.json({ challenge: 'c' })],
      [signInPath]: [() => Response.json({ session: {} })],
    });
    const added = Steps.added(await harness.flow.add());

    const waiting = Steps.added(await harness.flow.name(added, 'Phone'));
    const named = Steps.added(await harness.flow.confirmAndName(waiting));

    expect(waiting).toMatchObject({ confirming: 'Phone', error: null });
    expect(named).toMatchObject({ named: true, confirming: null });
    expect(named.passkey.name).toBe('Phone');
    expect(harness.requested.slice(2)).toEqual([
      renamePath,
      signInOptionsPath,
      signInPath,
      renamePath,
    ]);
  });
});

describe('SecondPasskeyFlow naming when the passkey check is dismissed', () => {
  it('keeps the name waiting, quietly, without saving it', async () => {
    const harness = new Harness({
      ...adding,
      [renamePath]: [Steps.failure(403, 'SESSION_NOT_FRESH')],
      [signInOptionsPath]: [() => Response.json({ challenge: 'c' })],
    });
    const added = Steps.added(await harness.flow.add());
    const waiting = Steps.added(await harness.flow.name(added, 'Phone'));
    harness.ceremonies.failWith = new PasskeyAuthError({
      code: 'ERROR_CEREMONY_ABORTED',
      status: 0,
    });

    await expect(harness.flow.confirmAndName(waiting)).resolves.toEqual({
      ...waiting,
      error: null,
    });
    expect(waiting).toMatchObject({ confirming: 'Phone', named: false });
    expect(
      harness.requested.filter((path) => path === renamePath),
    ).toHaveLength(1);
  });
});

describe('SecondPasskeyFlow rows', () => {
  const laptop: Passkey = {
    id: 'p1',
    name: null,
    createdAt: new Date('2026-11-27T09:58:00.000Z'),
    deviceType: 'singleDevice',
    backedUp: false,
  };
  const added: Passkey = { ...laptop, id: 'p2', name: 'Phone' };

  it('shows the listed passkeys, then the new one, once', () => {
    const current: SecondPasskeyStep = {
      step: 'added',
      passkey: added,
      named: true,
      confirming: null,
      error: null,
    };

    expect(SecondPasskeyFlow.rows({ listed: [laptop], current })).toEqual([
      laptop,
      added,
    ]);
    expect(
      SecondPasskeyFlow.rows({
        listed: [laptop, { ...added, name: null }],
        current,
      }),
    ).toEqual([laptop, added]);
    expect(
      SecondPasskeyFlow.rows({
        listed: [laptop],
        current: SecondPasskeyFlow.start(),
      }),
    ).toEqual([laptop]);
  });
});
