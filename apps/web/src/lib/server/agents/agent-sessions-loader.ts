import { redirect } from '@sveltejs/kit';
import { z } from 'zod';
import type { AgentSession } from '#lib/agents/agent-session-contracts.ts';
import { HttpAgentSessions } from '#lib/agents/http-agent-sessions.ts';
import { missionControlBaseUrlSchema } from '#lib/api/mission-control.ts';
import {
  type AuthPageLoadEvent,
  shellDataSchema,
} from '#lib/server/auth-page-loader.ts';

export const agentSessionsLoaderPropsSchema = z.object({
  apiBaseUrl: missionControlBaseUrlSchema,
});

export type AgentSessionsLoaderProps = z.input<
  typeof agentSessionsLoaderPropsSchema
>;

export type AgentSessionsState =
  { status: 'loaded'; sessions: AgentSession[] } | { status: 'failed' };

export interface AgentsPageData {
  agents: AgentSessionsState;
}

/** Reads the sessions for the Agents page. A failed read never fails the page. */
export interface AgentSessionsLoader {
  /** `/agents`, for a signed-in person. */
  readonly page: (event: AuthPageLoadEvent) => Promise<AgentsPageData>;
}

export class MissionControlAgentSessionsLoader implements AgentSessionsLoader {
  private readonly apiBaseUrl: string;

  constructor(props: AgentSessionsLoaderProps) {
    this.apiBaseUrl = agentSessionsLoaderPropsSchema.parse(props).apiBaseUrl;
  }

  readonly page = async (event: AuthPageLoadEvent): Promise<AgentsPageData> => {
    const shell = shellDataSchema.parse(await event.parent());
    if (shell.viewer === null) redirect(303, '/sign-in');
    return { agents: await this.fetchSessions(event) };
  };

  private async fetchSessions(
    event: AuthPageLoadEvent,
  ): Promise<AgentSessionsState> {
    const reads = new HttpAgentSessions({
      baseUrl: this.apiBaseUrl,
      fetch: event.fetch,
    });
    try {
      return { status: 'loaded', sessions: await reads.list() };
    } catch (error) {
      console.warn(
        `Mission Control did not list agent sessions: ${String(error)}`,
      );
      return { status: 'failed' };
    }
  }
}
