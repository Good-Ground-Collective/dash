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
      sessionId: payload.sessionId,
      agentId: payload.agentId ?? parentAgentId,
      agentName: record.agentName,
      benchId: record.benchId,
      harness: payload.harness,
      status: payload.status,
      summary: payload.summary ?? null,
      question: payload.question ?? null,
      highestSeq: payload.seq,
      reportedAt: new Date(record.message.emittedAt),
    };
  }

  static state(row: AgentSessionRow): AgentSessionState {
    return {
      sessionId: row.sessionId,
      agentId: storedAgentIdSchema.parse(row.agentId),
      agentName: row.agentName,
      benchId: row.benchId,
      harness: row.harness,
      status: row.status,
      summary: row.summary,
      question: row.question,
      highestSeq: row.highestSeq,
      startedAt: row.startedAt.toISOString(),
      reportedAt: row.reportedAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
    };
  }
}
