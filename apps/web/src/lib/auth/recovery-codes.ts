import { z } from 'zod';
import {
  missionControlBaseUrlSchema,
  type RecoveryCodeStatus,
  recoveryCodeStatusSchema,
} from '#lib/api/mission-control.ts';
import { MissionControlEndpoint } from '#lib/api/mission-control-endpoint.ts';

export const recoveryCodeSetSchema = z.object({
  setId: z.string().min(1),
  codes: z.array(z.string().min(1)).length(10),
});

export const httpRecoveryCodesPropsSchema = z.object({
  baseUrl: missionControlBaseUrlSchema,
  fetch: z.custom<typeof fetch>((value) => value instanceof Function),
});

export type RecoveryCodeSet = z.infer<typeof recoveryCodeSetSchema>;
export type HttpRecoveryCodesProps = z.input<
  typeof httpRecoveryCodesPropsSchema
>;

/** Makes and confirms recovery code sets, from the browser. The codes are only ever in the answer to `generate`. */
export interface RecoveryCodes {
  /** A new pending set, which replaces any earlier pending one. Rejects with `SESSION_NOT_FRESH` without a passkey sign-in from the last 15 minutes. */
  generate(): Promise<RecoveryCodeSet>;
  /** Makes the set the person's codes and voids every other set. Rejects with `RECOVERY_CODE_SET_NOT_PENDING` once a later set replaced it. */
  confirm(props: { setId: string }): Promise<RecoveryCodeStatus>;
}

/** Calls Mission Control's `/api/auth/recovery-codes` with credentials. Refusals reject with a `MissionControlError`. */
export class HttpRecoveryCodes implements RecoveryCodes {
  private readonly endpoint: MissionControlEndpoint;
  private readonly fetcher: typeof fetch;

  constructor(props: HttpRecoveryCodesProps) {
    const valid = httpRecoveryCodesPropsSchema.parse(props);
    this.endpoint = new MissionControlEndpoint({ baseUrl: valid.baseUrl });
    this.fetcher = valid.fetch;
  }

  async generate(): Promise<RecoveryCodeSet> {
    return this.post({
      path: 'api/auth/recovery-codes/generate',
      body: '{}',
      schema: recoveryCodeSetSchema,
    });
  }

  async confirm(props: { setId: string }): Promise<RecoveryCodeStatus> {
    return this.post({
      path: 'api/auth/recovery-codes/confirm',
      body: JSON.stringify({ setId: props.setId }),
      schema: recoveryCodeStatusSchema,
    });
  }

  private async post<T>(props: {
    path: string;
    body: string;
    schema: z.ZodType<T>;
  }): Promise<T> {
    const response = await this.fetcher(this.endpoint.url(props.path), {
      method: 'POST',
      credentials: 'include',
      headers: {
        accept: 'application/json',
        'content-type': 'application/json',
      },
      body: props.body,
    });
    return this.endpoint.read({
      path: props.path,
      response,
      schema: props.schema,
    });
  }

  /** The client the browser uses, with global `fetch`. */
  static inBrowser(props: { baseUrl: string }): HttpRecoveryCodes {
    return new HttpRecoveryCodes({
      baseUrl: props.baseUrl,
      fetch: (input, init) => fetch(input, init),
    });
  }
}
