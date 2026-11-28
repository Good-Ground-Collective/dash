import type { InferInsertModel, InferSelectModel } from 'drizzle-orm';

import type {
  AgentHeartbeatRecord,
  StoredAgentHeartbeat,
} from '#src/agents/contracts/agent-heartbeat.ts';
import type { agentHeartbeatTable } from '#src/agents/repositories/agent-heartbeats/agent-heartbeats-table.ts';

type AgentHeartbeatRow = InferSelectModel<typeof agentHeartbeatTable>;
type NewAgentHeartbeatRow = InferInsertModel<typeof agentHeartbeatTable>;

/** Heartbeats as `agent_heartbeat` rows, and back. */
export class AgentHeartbeatRows {
  static row(record: AgentHeartbeatRecord): NewAgentHeartbeatRow {
    const { payload } = record.message;
    return {
      reporterName: record.reporterName,
      benchId: record.benchId,
      reportedBy: record.reportedBy,
      sessionId: payload.sessionId,
      seq: payload.seq,
      agentId: payload.agentId ?? null,
      harness: payload.harness,
      status: payload.status,
      summary: payload.summary ?? null,
      question: payload.question ?? null,
      error: payload.error ?? null,
      taskId: payload.taskId ?? null,
      workspace: payload.workspace ?? null,
      machine: payload.machine ?? null,
      agent: payload.agent ?? null,
      emittedAt: new Date(record.message.emittedAt),
    };
  }

  static heartbeat(row: AgentHeartbeatRow): StoredAgentHeartbeat {
    return {
      id: row.id,
      reporterName: row.reporterName,
      benchId: row.benchId,
      sessionId: row.sessionId,
      seq: row.seq,
      agentId: row.agentId,
      harness: row.harness,
      status: row.status,
      summary: row.summary,
      question: row.question,
      error: row.error,
      taskId: row.taskId,
      workspace: row.workspace,
      machine: row.machine,
      agent: row.agent,
      emittedAt: row.emittedAt.toISOString(),
      receivedAt: row.receivedAt.toISOString(),
    };
  }
}
