import { z } from 'zod';
import { missionControlBaseUrlSchema } from '#lib/api/mission-control.ts';
import { MissionControlError } from '#lib/api/mission-control-error.ts';
import {
  type ApiKeyScope,
  type CreatedServiceAccount,
  createdServiceAccountSchema,
  type IssuedApiKey,
  issuedApiKeySchema,
  type NewServiceAccount,
} from '#lib/api/service-account-contracts.ts';

const failureSchema = z.object({
  code: z.string().optional(),
  message: z.string().optional(),
});

export const httpServiceAccountsPropsSchema = z.object({
  baseUrl: missionControlBaseUrlSchema,
  fetch: z.custom<typeof fetch>((value) => value instanceof Function),
});

export type HttpServiceAccountsProps = z.input<
  typeof httpServiceAccountsPropsSchema
>;

/** Changes to the signed-in person's service accounts, from the browser. Each needs a fresh passkey sign-in, or rejects with code `SESSION_NOT_FRESH`. */
export interface ServiceAccountChanges {
  create(input: NewServiceAccount): Promise<CreatedServiceAccount>;
  issueKey(props: {
    serviceAccountId: string;
    scopes: ApiKeyScope[];
  }): Promise<IssuedApiKey>;
  revokeKey(props: { keyId: string }): Promise<void>;
  revokeAccount(props: { serviceAccountId: string }): Promise<void>;
}

/** Calls Mission Control's `/api/auth/service-accounts` with credentials. Failures are `MissionControlError`s carrying Mission Control's code. */
export class HttpServiceAccounts implements ServiceAccountChanges {
  private readonly baseUrl: URL;
  private readonly fetcher: typeof fetch;

  constructor(props: HttpServiceAccountsProps) {
    const valid = httpServiceAccountsPropsSchema.parse(props);
    this.baseUrl = new URL(valid.baseUrl);
    if (!this.baseUrl.pathname.endsWith('/')) this.baseUrl.pathname += '/';
    this.fetcher = valid.fetch;
  }

  async create(input: NewServiceAccount): Promise<CreatedServiceAccount> {
    return this.post({
      path: 'create',
      body: input,
      schema: createdServiceAccountSchema,
    });
  }

  async issueKey(props: {
    serviceAccountId: string;
    scopes: ApiKeyScope[];
  }): Promise<IssuedApiKey> {
    return this.post({
      path: 'keys/create',
      body: props,
      schema: issuedApiKeySchema,
    });
  }

  async revokeKey(props: { keyId: string }): Promise<void> {
    await this.post({ path: 'keys/revoke', body: props, schema: z.unknown() });
  }

  async revokeAccount(props: { serviceAccountId: string }): Promise<void> {
    await this.post({ path: 'revoke', body: props, schema: z.unknown() });
  }

  private async post<T>(props: {
    path: string;
    body: object;
    schema: z.ZodType<T>;
  }): Promise<T> {
    const path = `api/auth/service-accounts/${props.path}`;
    const response = await this.fetcher(new URL(path, this.baseUrl), {
      method: 'POST',
      credentials: 'include',
      headers: {
        accept: 'application/json',
        'content-type': 'application/json',
      },
      body: JSON.stringify(props.body),
    });
    const text = await response.text();
    const json: unknown = text === '' ? null : JSON.parse(text);

    if (!response.ok) {
      const failure = failureSchema.safeParse(json);
      throw new MissionControlError({
        path,
        status: response.status,
        code: failure.success ? failure.data.code : undefined,
        message: failure.success ? failure.data.message : undefined,
      });
    }
    return props.schema.parse(json);
  }

  /** The client the browser uses: global `fetch`. */
  static inBrowser(props: { baseUrl: string }): HttpServiceAccounts {
    return new HttpServiceAccounts({
      baseUrl: props.baseUrl,
      fetch: (input, init) => fetch(input, init),
    });
  }
}
