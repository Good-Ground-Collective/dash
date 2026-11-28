import {
  type AgentSessionState,
  agentSessionStateSchema,
} from '#lib/agents/agent-session-contracts.ts';
import type { LiveEventDefinition } from '#lib/live/live-event-stream.ts';

/** The agent session event on Mission Control's `/events`. It carries one row of session state: the session's own, or a subagent's. */
export class AgentSessionLiveEvents {
  static readonly UPDATED: LiveEventDefinition<AgentSessionState> = {
    name: 'agent.session.updated',
    schema: agentSessionStateSchema,
  };
}
