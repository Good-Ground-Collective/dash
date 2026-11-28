import type {
  AgentActivity,
  AgentSession,
  AgentSessionState,
} from '#src/agents/contracts/agent-session.ts';

/** Rolls subagent rows up under the session they share, most recently updated session first. A session is its `(reportedBy, sessionId)`, and takes its reporter name, bench and harness from its own row, or from its first subagent until that row arrives. */
export class AgentSessionRollup {
  static sessions(states: readonly AgentSessionState[]): AgentSession[] {
    const sessions = new Map<string, AgentSession>();
    for (const state of states) {
      const key = `${state.reportedBy}/${state.sessionId}`;
      const session = sessions.get(key) ?? {
        ...AgentSessionRollup.identity(state),
        parent: null,
        subagents: [],
      };

      if (state.agentId === null) {
        Object.assign(session, AgentSessionRollup.identity(state), {
          parent: AgentSessionRollup.activity(state),
        });
      } else {
        session.subagents.push({
          agentId: state.agentId,
          ...AgentSessionRollup.activity(state),
        });
      }
      sessions.set(key, session);
    }

    return [...sessions.values()].toSorted(
      (left, right) =>
        AgentSessionRollup.latest(right) - AgentSessionRollup.latest(left),
    );
  }

  private static identity(
    state: AgentSessionState,
  ): Pick<
    AgentSession,
    'reportedBy' | 'sessionId' | 'reporterName' | 'benchId' | 'harness'
  > {
    return {
      reportedBy: state.reportedBy,
      sessionId: state.sessionId,
      reporterName: state.reporterName,
      benchId: state.benchId,
      harness: state.harness,
    };
  }

  private static activity(state: AgentSessionState): AgentActivity {
    return {
      status: state.status,
      liveness: state.liveness,
      livenessChangedAt: state.livenessChangedAt,
      summary: state.summary,
      question: state.question,
      error: state.error,
      taskId: state.taskId,
      workspace: state.workspace,
      machine: state.machine,
      agent: state.agent,
      highestSeq: state.highestSeq,
      startedAt: state.startedAt,
      reportedAt: state.reportedAt,
      updatedAt: state.updatedAt,
    };
  }

  private static latest(session: AgentSession): number {
    const activities = [session.parent ?? [], session.subagents].flat();
    return Math.max(
      ...activities.map((activity) => Date.parse(activity.updatedAt)),
    );
  }
}
