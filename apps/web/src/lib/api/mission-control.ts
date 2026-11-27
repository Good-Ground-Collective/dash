import { z } from 'zod';
import {
  MissionControlEndpoint,
  missionControlBaseUrlSchema,
} from '#lib/api/mission-control-endpoint.ts';
import {
  colorModeSchema,
  themeNameSchema,
} from '#lib/theme/theme-preference-reader.ts';
import {
  type ServiceAccount,
  serviceAccountListSchema,
} from '#lib/api/service-account-contracts.ts';

export { missionControlBaseUrlSchema };

export const viewerSchema = z.object({
  id: z.string(),
  name: z.string(),
  email: z.string(),
  theme: themeNameSchema.catch('characters'),
  colorMode: colorModeSchema
    .nullable()
    .catch(null)
    .describe('`null` until the viewer picks a mode.'),
});

export const sessionResponseSchema = z
  .object({ user: viewerSchema })
  .nullable();

export const passkeySchema = z.object({
  id: z.string(),
  name: z.string().nullish(),
  createdAt: z.coerce.date(),
  deviceType: z.string(),
  backedUp: z.boolean(),
});

export const setupStatusSchema = z.object({
  open: z
    .boolean()
    .describe('True while nobody has signed up and a setup token is waiting.'),
});

export const recoveryCodeStatusSchema = z.object({
  confirmed: z
    .boolean()
    .describe('False until the person has confirmed saving a set of codes.'),
  remaining: z.number().int().nonnegative(),
});

export const setupChecklistSchema = z.object({
  items: z
    .array(
      z.object({
        id: z
          .string()
          .describe('Such as `connectGitHub`. Home skips ids it doesn’t know.'),
        done: z.boolean(),
      }),
    )
    .describe('In the order home lists them.'),
});

export const httpMissionControlPropsSchema = z.object({
  baseUrl: missionControlBaseUrlSchema,
  fetch: z.custom<typeof fetch>((value) => value instanceof Function),
  timeoutMs: z.number().int().positive().default(3000),
});

export type Viewer = z.infer<typeof viewerSchema>;
export type Passkey = z.infer<typeof passkeySchema>;
export type SetupStatus = z.infer<typeof setupStatusSchema>;
export type RecoveryCodeStatus = z.infer<typeof recoveryCodeStatusSchema>;
export type SetupChecklistReport = z.infer<typeof setupChecklistSchema>;
export type HttpMissionControlProps = z.input<
  typeof httpMissionControlPropsSchema
>;

/** What the web app asks of Mission Control. */
export interface MissionControl {
  /** The signed-in viewer, or `null` when the session cookie is missing or expired. */
  getViewer(): Promise<Viewer | null>;
}

/** Reads the passkey pages render from. */
export interface PasskeyReads {
  /** Whether the first account can still be created. */
  getSetupStatus(): Promise<SetupStatus>;
  /** The signed-in person's passkeys, oldest first. */
  listPasskeys(): Promise<Passkey[]>;
}

/** Whether the signed-in person has saved recovery codes, and how many are unused. */
export interface RecoveryCodeReads {
  getRecoveryCodeStatus(): Promise<RecoveryCodeStatus>;
}

/** What's left of the signed-in person's setup, for home. */
export interface OnboardingReads {
  getSetupChecklist(): Promise<SetupChecklistReport>;
}

/** Reads the service account page renders from. */
export interface ServiceAccountReads {
  /** The signed-in person's service accounts with their keys, oldest first. */
  listServiceAccounts(): Promise<ServiceAccount[]>;
}

/** Mission Control over HTTP. Calls include credentials; on the server only the session cookie is forwarded. */
export class HttpMissionControl
  implements
    MissionControl,
    PasskeyReads,
    RecoveryCodeReads,
    OnboardingReads,
    ServiceAccountReads
{
  private readonly endpoint: MissionControlEndpoint;
  private readonly fetcher: typeof fetch;
  private readonly timeoutMs: number;

  constructor(props: HttpMissionControlProps) {
    const valid = httpMissionControlPropsSchema.parse(props);
    this.endpoint = new MissionControlEndpoint({ baseUrl: valid.baseUrl });
    this.fetcher = valid.fetch;
    this.timeoutMs = valid.timeoutMs;
  }

  async getViewer(): Promise<Viewer | null> {
    const session = await this.getJson({
      path: 'api/auth/get-session',
      schema: sessionResponseSchema,
    });
    return session?.user ?? null;
  }

  async getSetupStatus(): Promise<SetupStatus> {
    return this.getJson({
      path: 'api/auth/setup/status',
      schema: setupStatusSchema,
    });
  }

  async listPasskeys(): Promise<Passkey[]> {
    const passkeys = await this.getJson({
      path: 'api/auth/passkey/list-user-passkeys',
      schema: z.array(passkeySchema),
    });
    return passkeys.toSorted(
      (left, right) => left.createdAt.getTime() - right.createdAt.getTime(),
    );
  }

  async getRecoveryCodeStatus(): Promise<RecoveryCodeStatus> {
    return this.getJson({
      path: 'api/auth/recovery-codes/status',
      schema: recoveryCodeStatusSchema,
    });
  }

  async getSetupChecklist(): Promise<SetupChecklistReport> {
    return this.getJson({
      path: 'onboarding/checklist',
      schema: setupChecklistSchema,
    });
  }

  async listServiceAccounts(): Promise<ServiceAccount[]> {
    const list = await this.getJson({
      path: 'api/auth/service-accounts/list',
      schema: serviceAccountListSchema,
    });
    return list.serviceAccounts;
  }

  private async getJson<T>(props: {
    path: string;
    schema: z.ZodType<T>;
  }): Promise<T> {
    const response = await this.fetcher(this.endpoint.url(props.path), {
      credentials: 'include',
      headers: { accept: 'application/json' },
      signal: AbortSignal.timeout(this.timeoutMs),
    });

    return this.endpoint.read({
      path: props.path,
      response,
      schema: props.schema,
    });
  }
}
