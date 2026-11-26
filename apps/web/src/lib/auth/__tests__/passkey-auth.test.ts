import { describe, expect, it } from 'vitest';
import { HttpPasskeyAuth } from '#lib/auth/passkey-auth.ts';
import { PasskeyAuthError } from '#lib/auth/passkey-auth-error.ts';
import type {
  AuthenticationResponseJSON,
  PublicKeyCredentialCreationOptionsJSON,
  PublicKeyCredentialRequestOptionsJSON,
  RegistrationResponseJSON,
} from '@simplewebauthn/browser';
import type { WebAuthnCeremonies } from '#lib/auth/web-authn-ceremonies.ts';

interface Call {
  url: string;
  method: string;
  body: string | null;
  credentials: RequestCredentials | undefined;
}

class FakeMissionControl {
  readonly calls: Call[] = [];
  private readonly answers: Map<string, () => Response>;

  constructor(props: { answers: Record<string, () => Response> }) {
    this.answers = new Map(Object.entries(props.answers));
  }

  readonly fetch: typeof fetch = async (input, init) => {
    const url = new URL(input instanceof Request ? input.url : String(input));
    this.calls.push({
      url: `${url.pathname}${url.search}`,
      method: init?.method ?? 'GET',
      body: init?.body instanceof Object ? null : (init?.body ?? null),
      credentials: init?.credentials,
    });
    const answer = this.answers.get(url.pathname);
    return answer === undefined
      ? Response.json({ message: 'not found' }, { status: 404 })
      : answer();
  };
}

const fakeCredential = {
  id: 'credential',
  rawId: 'credential',
  type: 'public-key',
  clientExtensionResults: {},
} as const;

class FakeCeremonies implements WebAuthnCeremonies {
  readonly seen: { kind: string; challenge: string; autofill?: boolean }[] = [];

  async register(props: {
    options: PublicKeyCredentialCreationOptionsJSON;
  }): Promise<RegistrationResponseJSON> {
    this.seen.push({ kind: 'register', challenge: props.options.challenge });
    return {
      ...fakeCredential,
      response: { clientDataJSON: 'c', attestationObject: 'a' },
    };
  }

  async authenticate(props: {
    options: PublicKeyCredentialRequestOptionsJSON;
    autofill: boolean;
  }): Promise<AuthenticationResponseJSON> {
    this.seen.push({
      kind: 'authenticate',
      challenge: props.options.challenge,
      autofill: props.autofill,
    });
    return {
      ...fakeCredential,
      response: { clientDataJSON: 'c', authenticatorData: 'a', signature: 's' },
    };
  }
}

/** Canned Mission Control answers. */
class Answer {
  static registrationOptions(): Response {
    return Response.json({ challenge: 'abc', user: { id: 'u' } });
  }

  static authenticationOptions(): Response {
    return Response.json({ challenge: 'abc' });
  }

  static ok(): Response {
    return Response.json({ status: true });
  }
}

class Harness {
  readonly ceremonies = new FakeCeremonies();
  readonly missionControl: FakeMissionControl;
  readonly auth: HttpPasskeyAuth;

  constructor(props: { answers: Record<string, () => Response> }) {
    this.missionControl = new FakeMissionControl(props);
    this.auth = new HttpPasskeyAuth({
      baseUrl: 'https://api.dash.doublel.studio',
      fetch: this.missionControl.fetch,
      ceremonies: this.ceremonies,
    });
  }
}

describe('HttpPasskeyAuth setup', () => {
  it('trades the token for an enrolment and registers with it, signing in', async () => {
    const harness = new Harness({
      answers: {
        '/api/auth/setup/begin': () =>
          Response.json({ enrolment: 'setup-enrolment:xyz' }),
        '/api/auth/passkey/generate-register-options':
          Answer.registrationOptions,
        '/api/auth/passkey/verify-registration': Answer.ok,
      },
    });

    await harness.auth.setUp({
      token: 'token',
      name: 'Ada Lovelace',
      email: 'ada@example.com',
    });

    expect(harness.missionControl.calls.map((call) => call.url)).toEqual([
      '/api/auth/setup/begin',
      '/api/auth/passkey/generate-register-options?context=setup-enrolment%3Axyz',
      '/api/auth/passkey/verify-registration',
    ]);
    expect(
      JSON.parse(harness.missionControl.calls[2]?.body ?? '{}'),
    ).toMatchObject({
      response: { id: 'credential' },
      createSession: true,
    });
    expect(
      harness.missionControl.calls.every(
        (call) => call.credentials === 'include',
      ),
    ).toBe(true);
  });

  it('reports a closed setup with Mission Control’s code', async () => {
    const harness = new Harness({
      answers: {
        '/api/auth/setup/begin': () =>
          Response.json(
            { code: 'SETUP_CLOSED', message: 'Setup is closed' },
            { status: 403 },
          ),
      },
    });

    const attempt = harness.auth.setUp({
      token: 'token',
      name: 'Ada',
      email: 'ada@example.com',
    });

    await expect(attempt).rejects.toBeInstanceOf(PasskeyAuthError);
    await expect(attempt).rejects.toMatchObject({
      code: 'SETUP_CLOSED',
      status: 403,
    });
    expect(harness.ceremonies.seen).toEqual([]);
  });
});

describe('HttpPasskeyAuth sign-in and management', () => {
  it('signs in through browser autofill when asked', async () => {
    const harness = new Harness({
      answers: {
        '/api/auth/passkey/generate-authenticate-options':
          Answer.authenticationOptions,
        '/api/auth/passkey/verify-authentication': Answer.ok,
      },
    });

    await harness.auth.signIn({ autofill: true });

    expect(harness.ceremonies.seen).toEqual([
      { kind: 'authenticate', challenge: 'abc', autofill: true },
    ]);
  });

  it('surfaces a stale session as SESSION_NOT_FRESH', async () => {
    const harness = new Harness({
      answers: {
        '/api/auth/passkey/delete-passkey': () =>
          Response.json({ code: 'SESSION_NOT_FRESH' }, { status: 403 }),
      },
    });

    await expect(
      harness.auth.removePasskey({ id: 'p1' }),
    ).rejects.toMatchObject({ code: 'SESSION_NOT_FRESH' });
  });
});
