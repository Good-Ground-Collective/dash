import type {
  AuthenticationResponseJSON,
  PublicKeyCredentialCreationOptionsJSON,
  RegistrationResponseJSON,
} from '@simplewebauthn/browser';
import { describe, expect, it, vi } from 'vitest';
import type { Passkey } from '#lib/api/mission-control.ts';
import { HttpPasskeyAuth } from '#lib/auth/passkey-auth.ts';
import { PasskeyAuthError } from '#lib/auth/passkey-auth-error.ts';
import { passkeyWording } from '#lib/auth/passkey-wording.ts';
import {
  type AddedStep,
  SecondPasskeyFlow,
  type SecondPasskeyStep,
} from '#lib/auth/second-passkey-flow.ts';
import type { WebAuthnCeremonies } from '#lib/auth/web-authn-ceremonies.ts';

const optionsPath = '/api/auth/passkey/generate-register-options';
const verifyPath = '/api/auth/passkey/verify-registration';
const renamePath = '/api/auth/passkey/update-passkey';
const signInOptionsPath = '/api/auth/passkey/generate-authenticate-options';
const signInPath = '/api/auth/passkey/verify-authentication';

const phone = {
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
class Harness {
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

class Steps {
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
const adding = {
  [optionsPath]: [Steps.crossDeviceOptions],
  [verifyPath]: [() => Response.json(phone)],
};

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
