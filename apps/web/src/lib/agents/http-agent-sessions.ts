import { z } from 'zod';
import { missionControlBaseUrlSchema } from '#lib/api/mission-control.ts';
import { MissionControlEndpoint } from '#lib/api/mission-control-endpoint.ts';
import {
  type AgentSession,
  agentSessionsSchema,
} from '#lib/agents/agent-session-contracts.ts';

export const httpAgentSessionsPropsSchema = z.object({
  baseUrl: missionControlBaseUrlSchema,
  fetch: z.custom<typeof fetch>((value) => value instanceof Function),
  timeoutMs: z.number().int().positive().default(3000),
});

export type HttpAgentSessionsProps = z.input<
  typeof httpAgentSessionsPropsSchema
>;

/** Every session agents reported on lately. */
export interface AgentSessionReads {
  /** Sessions where anything reported in the last 24 hours, most recently updated first. Rejects with a `MissionControlError` when signed out. */
  list(): Promise<AgentSession[]>;
}

/** Calls Mission Control's `GET /api/agents/sessions` with credentials. */
export class HttpAgentSessions implements AgentSessionReads {
  private readonly endpoint: MissionControlEndpoint;
  private readonly fetcher: typeof fetch;
  private readonly timeoutMs: number;

  constructor(props: HttpAgentSessionsProps) {
    const valid = httpAgentSessionsPropsSchema.parse(props);
    this.endpoint = new MissionControlEndpoint({ baseUrl: valid.baseUrl });
    this.fetcher = valid.fetch;
    this.timeoutMs = valid.timeoutMs;
  }

  async list(): Promise<AgentSession[]> {
    const path = 'api/agents/sessions';
    const response = await this.fetcher(this.endpoint.url(path), {
      credentials: 'include',
      headers: { accept: 'application/json' },
      signal: AbortSignal.timeout(this.timeoutMs),
    });
    const body = await this.endpoint.read({
      path,
      response,
      schema: agentSessionsSchema,
    });
    return body.sessions;
  }

  /** For the page: global `fetch`, which sends the Mission Control session cookie. */
  static inBrowser(props: { baseUrl: string }): HttpAgentSessions {
    return new HttpAgentSessions({
      baseUrl: props.baseUrl,
      fetch: (input, init) => fetch(input, init),
    });
  }
}
