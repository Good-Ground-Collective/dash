import { AgentBenchGroups } from '#lib/agents/agent-bench-groups.ts';
import type {
  AgentActivity,
  AgentSession,
  AgentSessionState,
  Subagent,
} from '#lib/agents/agent-session-contracts.ts';
import { AgentSessionActivity } from '#lib/agents/agent-session-activity.ts';

/** How many sessions need a look. */
export interface AgentStats {
  active: number;
  needYou: number;
  staleOrLost: number;
}

/** The sessions on the Agents page. Each `agent.session.updated` row folds into its session, so a subagent never becomes a session of its own. */
export class AgentSessions {
  readonly list: readonly AgentSession[];

  private constructor(list: readonly AgentSession[]) {
    this.list = list;
  }

  /** Sessions grouped by bench, most recently active first, with sessions that have no bench last. */
  groups(): ReturnType<typeof AgentBenchGroups.of> {
    return AgentBenchGroups.of(this.list);
  }

  stats(): AgentStats {
    return {
      active: this.list.filter((session) =>
        AgentSessionActivity.isActive(session),
      ).length,
      needYou: this.list.filter((session) =>
        AgentSessionActivity.needsYou(session),
      ).length,
      staleOrLost: this.list.filter(
        (session) => AgentSessionActivity.liveness(session) !== 'live',
      ).length,
    };
  }

  /** Folds one row in: the session's own state, or a subagent's under it. A row older than what is already held is dropped: one with a lower `highestSeq`, or the same `highestSeq` and an earlier `livenessChangedAt`. */
  applyUpdate(state: AgentSessionState): AgentSessions {
    const key = AgentSessionActivity.key(state);
    const known = this.list.find(
      (session) => AgentSessionActivity.key(session) === key,
    );
    const next =
      state.agentId === null
        ? AgentSessions.withParent({ known, state })
        : AgentSessions.withSubagent({ known, state, agentId: state.agentId });

    if (next === known) return this;
    if (known === undefined) return new AgentSessions([...this.list, next]);
    return new AgentSessions(
      this.list.map((session) => (session === known ? next : session)),
    );
  }

  static of(list: readonly AgentSession[]): AgentSessions {
    return new AgentSessions(list);
  }

  private static withParent(props: {
    known: AgentSession | undefined;
    state: AgentSessionState;
  }): AgentSession {
    const { known, state } = props;
    if (AgentSessions.isOlder({ held: known?.parent, state })) {
      return known ?? AgentSessions.empty(state);
    }
    return {
      ...AgentSessions.empty(state),
      subagents: known?.subagents ?? [],
      parent: AgentSessions.activity(state),
    };
  }

  private static withSubagent(props: {
    known: AgentSession | undefined;
    state: AgentSessionState;
    agentId: string;
  }): AgentSession {
    const { known, state, agentId } = props;
    const base = known ?? AgentSessions.empty(state);
    const held = base.subagents.find(
      (subagent) => subagent.agentId === agentId,
    );
    if (AgentSessions.isOlder({ held, state })) return base;

    const updated: Subagent = { agentId, ...AgentSessions.activity(state) };
    return {
      ...base,
      subagents:
        held === undefined
          ? [...base.subagents, updated]
          : base.subagents.map((subagent) =>
              subagent === held ? updated : subagent,
            ),
    };
  }

  private static isOlder(props: {
    held: AgentActivity | null | undefined;
    state: AgentSessionState;
  }): boolean {
    const { held, state } = props;
    if (held == null) return false;
    if (held.highestSeq !== state.highestSeq) {
      return held.highestSeq > state.highestSeq;
    }
    return held.livenessChangedAt.getTime() > state.livenessChangedAt.getTime();
  }

  private static empty(state: AgentSessionState): AgentSession {
    return {
      reportedBy: state.reportedBy,
      sessionId: state.sessionId,
      reporterName: state.reporterName,
      benchId: state.benchId,
      harness: state.harness,
      parent: null,
      subagents: [],
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
}
