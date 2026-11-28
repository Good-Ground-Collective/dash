import type {
  AgentActivity,
  AgentSession,
  AgentSessionState,
  Subagent,
} from '#lib/agents/agent-session-contracts.ts';

const reportedBy = '2f0f6d1e-0000-4c1a-9a51-2f1f6a3c0099';

/** Sessions, subagents and the update rows that move them, with times given as minutes before noon. */
export class SampleAgentSessions {
  static readonly REPORTED_BY = reportedBy;

  static at(minutesBeforeNoon: number): Date {
    return new Date(Date.UTC(2026, 10, 27, 12, 0) - minutesBeforeNoon * 60_000);
  }

  static activity(
    props: Partial<AgentActivity> & { minutes?: number } = {},
  ): AgentActivity {
    const { minutes = 1, ...rest } = props;
    return {
      status: 'working',
      liveness: 'live',
      summary: null,
      question: null,
      error: null,
      taskId: null,
      workspace: null,
      machine: null,
      agent: null,
      livenessChangedAt: SampleAgentSessions.at(minutes + 30),
      highestSeq: 1,
      startedAt: SampleAgentSessions.at(minutes + 30),
      reportedAt: SampleAgentSessions.at(minutes),
      updatedAt: SampleAgentSessions.at(minutes),
      ...rest,
    };
  }

  static subagent(
    agentId: string,
    props: Partial<AgentActivity> & { minutes?: number } = {},
  ): Subagent {
    return { agentId, ...SampleAgentSessions.activity(props) };
  }

  static session(
    sessionId: string,
    props: {
      benchId?: string | null;
      parent?: (Partial<AgentActivity> & { minutes?: number }) | null;
      subagents?: Subagent[];
    } = {},
  ): AgentSession {
    const parent = props.parent === undefined ? {} : props.parent;
    return {
      reportedBy,
      sessionId,
      reporterName: `${sessionId}-hooks`,
      benchId: props.benchId === undefined ? 'studio' : props.benchId,
      harness: 'claude-code',
      parent: parent === null ? null : SampleAgentSessions.activity(parent),
      subagents: props.subagents ?? [],
    };
  }

  static update(props: {
    sessionId: string;
    agentId: string | null;
    activity?: Partial<AgentActivity> & { minutes?: number };
    benchId?: string | null;
  }): AgentSessionState {
    return {
      reportedBy,
      sessionId: props.sessionId,
      agentId: props.agentId,
      reporterName: `${props.sessionId}-hooks`,
      benchId: props.benchId === undefined ? 'studio' : props.benchId,
      harness: 'claude-code',
      ...SampleAgentSessions.activity(props.activity),
    };
  }

  /** An update row as it travels on `/events`. */
  static wire(state: AgentSessionState): string {
    return JSON.stringify({
      ...state,
      livenessChangedAt: state.livenessChangedAt.toISOString(),
      startedAt: state.startedAt.toISOString(),
      reportedAt: state.reportedAt.toISOString(),
      updatedAt: state.updatedAt.toISOString(),
    });
  }
}
