import type { AgentSessionState } from '#src/agents/contracts/agent-session.ts';
import type { AgentSessionRepository } from '#src/agents/repositories/agent-sessions/agent-session-repository.ts';

/** Session state rows set by a test, read back the way the repository does: every row of each session updated at or after `since`. */
export class StoredAgentSessions implements Pick<
  AgentSessionRepository,
  'listUpdatedSince'
> {
  readonly states: AgentSessionState[] = [];

  add(state: AgentSessionState): this {
    this.states.push(state);
    return this;
  }

  async listUpdatedSince(props: { since: Date }): Promise<AgentSessionState[]> {
    const updated = new Set(
      this.states
        .filter((state) => Date.parse(state.updatedAt) >= props.since.getTime())
        .map((state) => `${state.reportedBy}/${state.sessionId}`),
    );
    return this.states.filter((state) =>
      updated.has(`${state.reportedBy}/${state.sessionId}`),
    );
  }

  /** A `working` session's own row, with `overrides` laid over it. */
  static state(
    overrides: Partial<AgentSessionState> &
      Pick<AgentSessionState, 'reportedBy' | 'sessionId'>,
  ): AgentSessionState {
    return {
      agentId: null,
      reporterName: 'studio-mac',
      benchId: 'studio-mac',
      harness: 'claude-code',
      status: 'working',
      summary: 'Fixing the flaky sync test',
      question: null,
      error: null,
      taskId: null,
      workspace: {
        directory: '/Users/ada/code/app',
        repository: 'acme/app',
        branch: 'fix-sync',
      },
      machine: 'studio',
      agent: null,
      highestSeq: 3,
      startedAt: '2026-11-26T08:00:00.000Z',
      reportedAt: '2026-11-26T11:00:00.000Z',
      updatedAt: '2026-11-26T11:00:00.000Z',
      ...overrides,
    };
  }
}
