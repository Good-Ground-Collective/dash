import { z } from 'zod';
import { missionControlBaseUrlSchema } from '#lib/api/mission-control.ts';
import { MissionControlEndpoint } from '#lib/api/mission-control-endpoint.ts';
import {
  type CreatedServiceAccount,
  createdServiceAccountSchema,
  type IssuedApiKey,
  issuedApiKeySchema,
  type NewServiceAccount,
} from '#lib/api/service-account-contracts.ts';

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
  /** Mission Control gives the key the scopes chosen when the account was created. */
  issueKey(props: { serviceAccountId: string }): Promise<IssuedApiKey>;
  revokeKey(props: { keyId: string }): Promise<void>;
  revokeAccount(props: { serviceAccountId: string }): Promise<void>;
}

/** Calls Mission Control's `/api/auth/service-accounts` with credentials. Failures are `MissionControlError`s carrying Mission Control's code. */
export class HttpServiceAccounts implements ServiceAccountChanges {
  private readonly endpoint: MissionControlEndpoint;
  private readonly fetcher: typeof fetch;

  constructor(props: HttpServiceAccountsProps) {
    const valid = httpServiceAccountsPropsSchema.parse(props);
    this.endpoint = new MissionControlEndpoint({ baseUrl: valid.baseUrl });
    this.fetcher = valid.fetch;
  }

  async create(input: NewServiceAccount): Promise<CreatedServiceAccount> {
    return this.post({
      path: 'create',
      body: input,
      schema: createdServiceAccountSchema,
    });
  }

  async issueKey(props: { serviceAccountId: string }): Promise<IssuedApiKey> {
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
    const response = await this.fetcher(this.endpoint.url(path), {
      method: 'POST',
      credentials: 'include',
      headers: {
        accept: 'application/json',
        'content-type': 'application/json',
      },
      body: JSON.stringify(props.body),
    });
    return this.endpoint.read({ path, response, schema: props.schema });
  }

  /** For the page: global `fetch`, which sends the person's Mission Control session cookie because every call sets `credentials: 'include'`. */
  static inBrowser(props: { baseUrl: string }): HttpServiceAccounts {
    return new HttpServiceAccounts({
      baseUrl: props.baseUrl,
      fetch: (input, init) => fetch(input, init),
    });
  }
}
