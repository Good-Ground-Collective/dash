import {
  ceremonyOptionsSchema,
  SoftwareAuthenticator,
} from '#src/auth/__tests__/support/software-authenticator.ts';
import { setupEnrolmentSchema } from '#src/auth/contracts/setup.ts';
import type { Identity } from '#src/auth/services/identity/identity.ts';

type IdentityEndpoint = Pick<Identity, 'baseUrl' | 'basePath' | 'handle'>;

/** A browser on the web origin: keeps Mission Control's cookies and owns one passkey authenticator. */
export class PasskeyBrowser {
  readonly authenticator: SoftwareAuthenticator;
  private readonly identity: IdentityEndpoint;
  private readonly origin: string;
  private readonly cookies = new Map<string, string>();

  constructor(props: { identity: IdentityEndpoint; origin: string }) {
    this.identity = props.identity;
    this.origin = props.origin;
    this.authenticator = new SoftwareAuthenticator({ origin: props.origin });
  }

  async get(path: string): Promise<Response> {
    return this.send(path, { method: 'GET' });
  }

  /** Posts `body`, already JSON. */
  async post(path: string, body: string): Promise<Response> {
    return this.send(path, {
      method: 'POST',
      body,
      headers: { 'content-type': 'application/json' },
    });
  }

  /** Checks a setup token without spending it. */
  async checkSetup(props: { token: string }): Promise<Response> {
    return this.post('/setup/check', JSON.stringify({ token: props.token }));
  }

  /** Starts setup and returns the enrolment, or the failed response. */
  async beginSetup(props: {
    token: string;
    name?: string;
    email?: string;
  }): Promise<Response> {
    return this.post(
      '/setup/begin',
      JSON.stringify({
        token: props.token,
        name: props.name ?? 'Ada Lovelace',
        email: props.email ?? 'ada@example.com',
      }),
    );
  }

  /** Runs both halves of passkey registration; answers the first failure. */
  async registerPasskey(props: {
    context?: string;
    createSession?: boolean;
    name?: string;
  }): Promise<Response> {
    const options = await this.registrationOptions(props);
    if (!options.ok) {
      return options;
    }
    return this.verifyRegistration(options, props);
  }

  /** The first half of registration: the ceremony options, which also bind the enrolment `context` to this browser's challenge. */
  async registrationOptions(props: { context?: string }): Promise<Response> {
    const query =
      props.context === undefined
        ? ''
        : `?${new URLSearchParams({ context: props.context }).toString()}`;
    return this.get(`/passkey/generate-register-options${query}`);
  }

  /** The second half: answers `options` with this browser's authenticator. */
  async verifyRegistration(
    options: Response,
    props: { createSession?: boolean; name?: string },
  ): Promise<Response> {
    return this.post(
      '/passkey/verify-registration',
      JSON.stringify({
        response: this.authenticator.register(
          ceremonyOptionsSchema.parse(await options.json()),
        ),
        name: props.name,
        createSession: props.createSession,
      }),
    );
  }

  async signIn(): Promise<Response> {
    const options = await this.get('/passkey/generate-authenticate-options');
    if (!options.ok) {
      return options;
    }

    return this.post(
      '/passkey/verify-authentication',
      JSON.stringify({
        response: this.authenticator.authenticate(
          ceremonyOptionsSchema.parse(await options.json()),
        ),
      }),
    );
  }

  async signOut(): Promise<Response> {
    return this.post('/sign-out', '{}');
  }

  /** Signs in with an enrolment straight from setup. */
  async setUp(props: { token: string }): Promise<Response> {
    const begun = await this.beginSetup(props);
    const { enrolment } = setupEnrolmentSchema.parse(await begun.json());
    return this.registerPasskey({ context: enrolment, createSession: true });
  }

  private async send(path: string, init: RequestInit): Promise<Response> {
    const headers = new Headers(init.headers);
    headers.set('origin', this.origin);
    if (this.cookies.size > 0) {
      headers.set(
        'cookie',
        [...this.cookies].map(([name, value]) => `${name}=${value}`).join('; '),
      );
    }

    const response = await this.identity.handle(
      new Request(`${this.identity.baseUrl}${this.identity.basePath}${path}`, {
        ...init,
        headers,
      }),
    );
    this.keepCookies(response);
    return response;
  }

  private keepCookies(response: Response): void {
    for (const line of response.headers.getSetCookie()) {
      const [pair = ''] = line.split(';');
      const separator = pair.indexOf('=');
      const name = pair.slice(0, separator);
      const value = pair.slice(separator + 1);
      if (value === '' || /max-age=0/iu.test(line)) {
        this.cookies.delete(name);
      } else {
        this.cookies.set(name, value);
      }
    }
  }
}
