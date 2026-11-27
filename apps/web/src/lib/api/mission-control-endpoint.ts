import { z } from 'zod';
import { MissionControlError } from '#lib/api/mission-control-error.ts';

/** A response body as JSON. An empty body or one that isn't JSON, such as a proxy's error page, fails to parse. */
const jsonTextSchema = z.string().transform((value, context) => {
  try {
    const parsed: unknown = JSON.parse(value);
    return parsed;
  } catch {
    context.addIssue({ code: 'custom', message: 'The body is not JSON' });
    return z.NEVER;
  }
});

const failureSchema = z.object({
  code: z.string().optional(),
  message: z.string().optional(),
});

/** Where a Mission Control client sends requests, and how it reads a refusal. Shared by every client. */
export class MissionControlEndpoint {
  private readonly base: URL;

  constructor(props: { baseUrl: string }) {
    this.base = new URL(props.baseUrl);
    if (!this.base.pathname.endsWith('/')) this.base.pathname += '/';
  }

  /** `path` under the base URL, which may itself carry a path prefix. */
  url(path: string): URL {
    return new URL(path, this.base);
  }

  /** Parses a 2xx answer's JSON body with `schema`. Any other answer rejects with a `MissionControlError` carrying Mission Control's code and message. */
  async read<T>(props: {
    path: string;
    response: Response;
    schema: z.ZodType<T>;
  }): Promise<T> {
    const text = jsonTextSchema.safeParse(await props.response.text());
    const body = text.success ? text.data : null;

    if (!props.response.ok) {
      const failure = failureSchema.safeParse(body);
      throw new MissionControlError({
        path: props.path,
        status: props.response.status,
        code: failure.success ? failure.data.code : undefined,
        message: failure.success ? failure.data.message : undefined,
      });
    }
    return props.schema.parse(body);
  }
}
