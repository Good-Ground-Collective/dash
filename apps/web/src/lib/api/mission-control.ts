import { z } from 'zod';
import { MissionControlError } from '#lib/api/mission-control-error.ts';

export const missionControlBaseUrlSchema = z.url({ protocol: /^https?$/u });

export const viewerSchema = z.object({
  id: z.string(),
  name: z.string(),
  email: z.string(),
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

export const httpMissionControlPropsSchema = z.object({
  baseUrl: missionControlBaseUrlSchema,
  fetch: z.custom<typeof fetch>((value) => value instanceof Function),
  timeoutMs: z.number().int().positive().default(3000),
});

export type Viewer = z.infer<typeof viewerSchema>;
export type Passkey = z.infer<typeof passkeySchema>;
export type SetupStatus = z.infer<typeof setupStatusSchema>;
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

/** Mission Control over HTTP. Calls include credentials; on the server only the session cookie is forwarded. */
export class HttpMissionControl implements MissionControl, PasskeyReads {
  private readonly baseUrl: URL;
  private readonly fetcher: typeof fetch;
  private readonly timeoutMs: number;

  constructor(props: HttpMissionControlProps) {
    const valid = httpMissionControlPropsSchema.parse(props);
    this.baseUrl = new URL(valid.baseUrl);
    if (!this.baseUrl.pathname.endsWith('/')) this.baseUrl.pathname += '/';
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

  private async getJson<T>(props: {
    path: string;
    schema: z.ZodType<T>;
  }): Promise<T> {
    const response = await this.fetcher(new URL(props.path, this.baseUrl), {
      credentials: 'include',
      headers: { accept: 'application/json' },
      signal: AbortSignal.timeout(this.timeoutMs),
    });

    if (!response.ok) {
      throw new MissionControlError({
        path: props.path,
        status: response.status,
      });
    }

    return props.schema.parse(await response.json());
  }
}
