import { agentHeartbeatStatuses } from '@good-ground-collective/agentic-communication-standards';
import {
  bigint,
  index,
  jsonb,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uuid,
} from 'drizzle-orm/pg-core';

import type {
  AgentHeartbeatAgent,
  AgentHeartbeatError,
  AgentHeartbeatQuestion,
  AgentHeartbeatWorkspace,
} from '#src/agents/contracts/agent-heartbeat.ts';
import { agentLivenesses } from '#src/agents/definitions/agent-liveness/agent-liveness.ts';

/** The `agent_id` of a session's own row. Subagents carry their own id; an empty string keeps the parent inside the primary key, where `null` could not be. */
export const parentAgentId = '';

/** The current state of each session and each subagent under it, as of the highest `seq` it has reported. Keyed by the principal that reported it, so another key sending the same `sessionId` gets a row of its own. `reported_by` has no foreign key: like `agent_heartbeat`, state stays when the account is revoked. */
export const agentSessionTable = pgTable(
  'agent_session',
  {
    reportedBy: uuid('reported_by').notNull(),
    sessionId: text('session_id').notNull(),
    agentId: text('agent_id').notNull().default(parentAgentId),
    reporterName: text('reporter_name').notNull(),
    benchId: text('bench_id'),
    harness: text('harness').notNull(),
    status: text('status', { enum: agentHeartbeatStatuses }).notNull(),
    liveness: text('liveness', { enum: agentLivenesses })
      .notNull()
      .default('live'),
    livenessChangedAt: timestamp('liveness_changed_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
    summary: text('summary'),
    question: jsonb('question').$type<AgentHeartbeatQuestion>(),
    error: jsonb('error').$type<AgentHeartbeatError>(),
    taskId: text('task_id'),
    workspace: jsonb('workspace').$type<AgentHeartbeatWorkspace>(),
    machine: text('machine'),
    agent: jsonb('agent').$type<AgentHeartbeatAgent>(),
    highestSeq: bigint('highest_seq', { mode: 'number' }).notNull(),
    startedAt: timestamp('started_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
    reportedAt: timestamp('reported_at', { withTimezone: true }).notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    primaryKey({
      columns: [table.reportedBy, table.sessionId, table.agentId],
    }),
    index('agent_session_updated_at_idx').on(table.updatedAt),
  ],
);
