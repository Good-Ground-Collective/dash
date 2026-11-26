import { z } from 'zod';
import { ApiError } from '#lib/api/api-error.ts';

export const viewerSchema = z.object({
  id: z.string(),
  name: z.string(),
  email: z.string(),
});

export const sessionResponseSchema = z
  .object({ user: viewerSchema })
  .nullable();

export type Viewer = z.infer<typeof viewerSchema>;

/** Typed client for Mission Control. Calls always carry cookies. */
export class ApiClient {
  private readonly baseUrl: URL;
  private readonly fetcher: typeof fetch;
  private readonly timeoutMs: number;

  constructor(props: {
    baseUrl: string;
    fetch: typeof fetch;
    timeoutMs?: number;
  }) {
    this.baseUrl = new URL(props.baseUrl);
    this.fetcher = props.fetch;
    this.timeoutMs = props.timeoutMs ?? ApiClient.DEFAULT_TIMEOUT_MS;
  }

  /** The signed-in viewer, or `null` when the session cookie is missing or expired. */
  async getViewer(): Promise<Viewer | null> {
    const session = await this.getJson({
      path: '/api/auth/get-session',
      schema: sessionResponseSchema,
    });
    return session?.user ?? null;
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
    if (!response.ok)
      throw new ApiError({ path: props.path, status: response.status });
    return props.schema.parse(await response.json());
  }

  static readonly DEFAULT_TIMEOUT_MS = 3000;
}
