import { z } from 'zod';
import { missionControlBaseUrlSchema } from '#lib/api/mission-control.ts';
import { MissionControlEndpoint } from '#lib/api/mission-control-endpoint.ts';
import { PasskeyAuthError } from '#lib/auth/passkey-auth-error.ts';
import {
  authenticationOptionsSchema,
  BrowserWebAuthnCeremonies,
  registrationOptionsSchema,
  type WebAuthnCeremonies,
} from '#lib/auth/web-authn-ceremonies.ts';

export const setupEnrolmentSchema = z.object({ enrolment: z.string() });

export const setupCheckedSchema = z.object({ valid: z.literal(true) });

const acknowledgedSchema = z.looseObject({});

export const missionControlFailureSchema = z.object({
  code: z.string().optional(),
  message: z.string().optional(),
});

export const httpPasskeyAuthPropsSchema = z.object({
  baseUrl: missionControlBaseUrlSchema,
  fetch: z.custom<typeof fetch>((value) => value instanceof Function),
  ceremonies: z.custom<WebAuthnCeremonies>(),
});

export type HttpPasskeyAuthProps = z.input<typeof httpPasskeyAuthPropsSchema>;

/** Passkey ceremonies and passkey changes against Mission Control, from the browser. Reads go through `HttpMissionControl`. */
export interface PasskeyAuth {
  /** Confirms the setup token is the current one, without spending it. Rejects like `setUp` does. */
  checkSetupToken(props: { token: string }): Promise<void>;
  /** Trades the setup token for an enrolment, enrols a passkey and signs the new person in. */
  setUp(props: { token: string; name: string; email: string }): Promise<void>;
  /** Signs in with a passkey. With `autofill`, waits for the browser's passkey autofill instead of prompting. */
  signIn(props: { autofill: boolean }): Promise<void>;
  signOut(): Promise<void>;
  addPasskey(props: { name: string }): Promise<void>;
  renamePasskey(props: { id: string; name: string }): Promise<void>;
  removePasskey(props: { id: string }): Promise<void>;
}

/** Calls Mission Control's `/api/auth` with credentials and runs WebAuthn ceremonies in between. */
export class HttpPasskeyAuth implements PasskeyAuth {
  private readonly endpoint: MissionControlEndpoint;
  private readonly fetcher: typeof fetch;
  private readonly ceremonies: WebAuthnCeremonies;

  constructor(props: HttpPasskeyAuthProps) {
    const valid = httpPasskeyAuthPropsSchema.parse(props);
    this.endpoint = new MissionControlEndpoint({ baseUrl: valid.baseUrl });
    this.fetcher = valid.fetch;
    this.ceremonies = valid.ceremonies;
  }

  async checkSetupToken(props: { token: string }): Promise<void> {
    await this.post({
      path: 'setup/check',
      body: JSON.stringify({ token: props.token }),
      schema: setupCheckedSchema,
    });
  }

  async setUp(props: {
    token: string;
    name: string;
    email: string;
  }): Promise<void> {
    const { enrolment } = await this.post({
      path: 'setup/begin',
      body: JSON.stringify(props),
      schema: setupEnrolmentSchema,
    });
    await this.register({ context: enrolment, createSession: true });
  }

  async signIn(props: { autofill: boolean }): Promise<void> {
    const options = await this.get({
      path: 'passkey/generate-authenticate-options',
      schema: authenticationOptionsSchema,
    });
    const response = await this.ceremonies.authenticate({
      options,
      autofill: props.autofill,
    });
    await this.post({
      path: 'passkey/verify-authentication',
      body: JSON.stringify({ response }),
      schema: acknowledgedSchema,
    });
  }

  async signOut(): Promise<void> {
    await this.post({
      path: 'sign-out',
      body: '{}',
      schema: acknowledgedSchema,
    });
  }

  async addPasskey(props: { name: string }): Promise<void> {
    await this.register({ name: props.name });
  }

  async renamePasskey(props: { id: string; name: string }): Promise<void> {
    await this.post({
      path: 'passkey/update-passkey',
      body: JSON.stringify(props),
      schema: acknowledgedSchema,
    });
  }

  async removePasskey(props: { id: string }): Promise<void> {
    await this.post({
      path: 'passkey/delete-passkey',
      body: JSON.stringify(props),
      schema: acknowledgedSchema,
    });
  }

  private async register(props: {
    context?: string;
    name?: string;
    createSession?: boolean;
  }): Promise<void> {
    const query = new URLSearchParams();
    if (props.context !== undefined) query.set('context', props.context);
    const options = await this.get({
      path: `passkey/generate-register-options?${query.toString()}`,
      schema: registrationOptionsSchema,
    });
    const response = await this.ceremonies.register({ options });
    await this.post({
      path: 'passkey/verify-registration',
      body: JSON.stringify({
        response,
        name: props.name,
        createSession: props.createSession,
      }),
      schema: acknowledgedSchema,
    });
  }

  private async get<T>(props: {
    path: string;
    schema: z.ZodType<T>;
  }): Promise<T> {
    return this.send({
      path: props.path,
      schema: props.schema,
      init: { headers: { accept: 'application/json' } },
    });
  }

  /** POSTs `body`, already JSON. */
  private async post<T>(props: {
    path: string;
    body: string;
    schema: z.ZodType<T>;
  }): Promise<T> {
    return this.send({
      path: props.path,
      schema: props.schema,
      init: {
        method: 'POST',
        headers: {
          accept: 'application/json',
          'content-type': 'application/json',
        },
        body: props.body,
      },
    });
  }

  /** Turns a non-2xx answer into a `PasskeyAuthError` carrying Mission Control's code. */
  private async send<T>(props: {
    path: string;
    schema: z.ZodType<T>;
    init: RequestInit;
  }): Promise<T> {
    const response = await this.fetcher(
      this.endpoint.url(`api/auth/${props.path}`),
      { ...props.init, credentials: 'include' },
    );
    const text = await response.text();

    if (!response.ok) {
      const failure = missionControlFailureSchema.safeParse(
        text === '' ? {} : JSON.parse(text),
      );
      throw new PasskeyAuthError({
        code: (failure.success ? failure.data.code : undefined) ?? 'UNKNOWN',
        message: failure.success ? failure.data.message : undefined,
        status: response.status,
      });
    }
    return props.schema.parse(text === '' ? null : JSON.parse(text));
  }

  /** The client the browser uses: global `fetch` and the browser's WebAuthn. */
  static inBrowser(props: { baseUrl: string }): HttpPasskeyAuth {
    return new HttpPasskeyAuth({
      baseUrl: props.baseUrl,
      fetch: (input, init) => fetch(input, init),
      ceremonies: new BrowserWebAuthnCeremonies(),
    });
  }
}
