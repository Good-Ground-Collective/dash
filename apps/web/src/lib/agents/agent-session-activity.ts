import type {
  AgentActivity,
  AgentLiveness,
  AgentSession,
  AgentStatus,
} from '#lib/agents/agent-session-contracts.ts';

const endedStatuses: readonly AgentStatus[] = ['complete', 'failed', 'error'];

/** What a whole session is doing, read from its own state and its subagents'. */
export class AgentSessionActivity {
  /** Two reporters sending the same session id are two sessions. */
  static key(props: { reportedBy: string; sessionId: string }): string {
    return `${props.reportedBy}/${props.sessionId}`;
  }

  /** Everything the session and its subagents have reported. */
  static all(session: AgentSession): AgentActivity[] {
    return [session.parent ?? [], session.subagents].flat();
  }

  /** When anything in the session last reported, as Mission Control received it. */
  static lastReportedAt(session: AgentSession): Date {
    const times = AgentSessionActivity.all(session).map((activity) =>
      activity.updatedAt.getTime(),
    );
    return new Date(Math.max(0, ...times));
  }

  /** The session's own status. `null` while only its subagents have reported. */
  static status(session: AgentSession): AgentStatus | null {
    return session.parent?.status ?? null;
  }

  /** The session's own liveness, or the worst of its subagents' while it has not reported itself. */
  static liveness(session: AgentSession): AgentLiveness {
    if (session.parent !== null) return session.parent.liveness;
    const subagents = session.subagents.map((subagent) => subagent.liveness);
    if (subagents.includes('lost')) return 'lost';
    return subagents.includes('stale') ? 'stale' : 'live';
  }

  static isActive(session: AgentSession): boolean {
    const status = AgentSessionActivity.status(session);
    const ended = status !== null && endedStatuses.includes(status);
    return !ended && AgentSessionActivity.liveness(session) === 'live';
  }

  /** The session or one of its subagents asked a question or is blocked. */
  static needsYou(session: AgentSession): boolean {
    return AgentSessionActivity.all(session).some(
      (activity) =>
        activity.question !== null ||
        activity.status === 'question' ||
        activity.status === 'blocked',
    );
  }
}
