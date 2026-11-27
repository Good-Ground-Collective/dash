import type {
  AgentHeartbeatRecord,
  StoredAgentHeartbeat,
} from '#src/agents/contracts/agent-heartbeat.ts';
import type { AgentSessionState } from '#src/agents/contracts/agent-session.ts';
import type {
  AgentHeartbeatRepository,
  RecordedAgentHeartbeat,
} from '#src/agents/repositories/agent-heartbeats/agent-heartbeat-repository.ts';
import type { AgentSessionRepository } from '#src/agents/repositories/agent-sessions/agent-session-repository.ts';

/** Heartbeats and session state in memory, deduplicating and advancing as the Drizzle repositories do. */
export class InMemoryAgentRecords
  implements AgentHeartbeatRepository, AgentSessionRepository
{
  readonly heartbeats: StoredAgentHeartbeat[] = [];
  private readonly states = new Map<string, AgentSessionState>();

  async record(record: AgentHeartbeatRecord): Promise<RecordedAgentHeartbeat> {
    const { payload } = record.message;
    const stored = this.heartbeats.find(
      (heartbeat) =>
        heartbeat.sessionId === payload.sessionId &&
        heartbeat.seq === payload.seq,
    );
    if (stored !== undefined) {
      return { outcome: 'duplicate', heartbeat: stored, session: null };
    }

    const heartbeat: StoredAgentHeartbeat = {
      id: crypto.randomUUID(),
      agentName: record.agentName,
      benchId: record.benchId,
      sessionId: payload.sessionId,
      seq: payload.seq,
      agentId: payload.agentId ?? null,
      harness: payload.harness,
      status: payload.status,
      summary: payload.summary ?? null,
      question: payload.question ?? null,
      emittedAt: record.message.emittedAt,
      receivedAt: new Date().toISOString(),
    };
    this.heartbeats.push(heartbeat);
    return { outcome: 'created', heartbeat, session: this.advance(heartbeat) };
  }

  async deleteReceivedBefore(props: { cutoff: Date }): Promise<number> {
    const expired = this.heartbeats.filter(
      (heartbeat) => Date.parse(heartbeat.receivedAt) < props.cutoff.getTime(),
    );
    for (const heartbeat of expired) {
      this.heartbeats.splice(this.heartbeats.indexOf(heartbeat), 1);
    }
    return expired.length;
  }

  async listUpdatedSince(props: { since: Date }): Promise<AgentSessionState[]> {
    const states = [...this.states.values()];
    const updated = new Set(
      states
        .filter((state) => Date.parse(state.updatedAt) >= props.since.getTime())
        .map((state) => state.sessionId),
    );
    return states.filter((state) => updated.has(state.sessionId));
  }

  private advance(heartbeat: StoredAgentHeartbeat): AgentSessionState | null {
    const key = `${heartbeat.sessionId}/${heartbeat.agentId ?? ''}`;
    const current = this.states.get(key);
    if (current !== undefined && current.highestSeq >= heartbeat.seq) {
      return null;
    }

    const state: AgentSessionState = {
      sessionId: heartbeat.sessionId,
      agentId: heartbeat.agentId,
      agentName: heartbeat.agentName,
      benchId: heartbeat.benchId,
      harness: heartbeat.harness,
      status: heartbeat.status,
      summary: heartbeat.summary ?? current?.summary ?? null,
      question: heartbeat.question,
      highestSeq: heartbeat.seq,
      startedAt: current?.startedAt ?? heartbeat.receivedAt,
      reportedAt: heartbeat.emittedAt,
      updatedAt: heartbeat.receivedAt,
    };
    this.states.set(key, state);
    return state;
  }
}
