import type { InferInsertModel, InferSelectModel } from 'drizzle-orm';
import { z } from 'zod';

import type { AgentHeartbeatRecord } from '#src/agents/contracts/agent-heartbeat.ts';
import type { AgentSessionState } from '#src/agents/contracts/agent-session.ts';
import {
  type agentSessionTable,
  parentAgentId,
} from '#src/agents/repositories/agent-sessions/agent-sessions-table.ts';

type AgentSessionRow = InferSelectModel<typeof agentSessionTable>;
type NewAgentSessionRow = InferInsertModel<typeof agentSessionTable>;

const storedAgentIdSchema = z
  .string()
  .transform((agentId) => (agentId === parentAgentId ? null : agentId));

/** Session state as `agent_session` rows, and back. */
export class AgentSessionRows {
  /** The state a heartbeat sets, for the session or subagent that reported it. */
  static row(record: AgentHeartbeatRecord): NewAgentSessionRow {
    const { payload } = record.message;
    return {
      reportedBy: record.reportedBy,
      sessionId: payload.sessionId,
      agentId: payload.agentId ?? parentAgentId,
      reporterName: record.reporterName,
      benchId: record.benchId,
      harness: payload.harness,
      status: payload.status,
      summary: payload.summary ?? null,
      question: payload.question ?? null,
      error: payload.error ?? null,
      taskId: payload.taskId ?? null,
      workspace: payload.workspace ?? null,
      machine: payload.machine ?? null,
      agent: payload.agent ?? null,
      highestSeq: payload.seq,
      reportedAt: new Date(record.message.emittedAt),
    };
  }

  static state(row: AgentSessionRow): AgentSessionState {
    return {
      reportedBy: row.reportedBy,
      sessionId: row.sessionId,
      agentId: storedAgentIdSchema.parse(row.agentId),
      reporterName: row.reporterName,
      benchId: row.benchId,
      harness: row.harness,
      status: row.status,
      summary: row.summary,
      question: row.question,
      error: row.error,
      taskId: row.taskId,
      workspace: row.workspace,
      machine: row.machine,
      agent: row.agent,
      highestSeq: row.highestSeq,
      startedAt: row.startedAt.toISOString(),
      reportedAt: row.reportedAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
    };
  }
}
