import { agentHeartbeatStatuses } from '@good-ground-collective/agentic-communication-standards';
import {
  bigint,
  index,
  jsonb,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';

import type {
  AgentHeartbeatAgent,
  AgentHeartbeatError,
  AgentHeartbeatQuestion,
  AgentHeartbeatWorkspace,
} from '#src/agents/contracts/agent-heartbeat.ts';
import { userTable } from '#src/auth/repositories/auth-store/auth-store-table.ts';

/** Each v1 heartbeat an agent reported with a service account key, kept for 30 days. Kept when the account is revoked. A `(sessionId, seq)` is unique per reporting principal, so one key can never collide with another's. */
export const agentHeartbeatTable = pgTable(
  'agent_heartbeat',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    reporterName: text('reporter_name').notNull(),
    benchId: text('bench_id'),
    reportedBy: uuid('reported_by').references(() => userTable.id, {
      onDelete: 'set null',
    }),
    sessionId: text('session_id').notNull(),
    seq: bigint('seq', { mode: 'number' }).notNull(),
    agentId: text('agent_id'),
    harness: text('harness').notNull(),
    status: text('status', { enum: agentHeartbeatStatuses }).notNull(),
    summary: text('summary'),
    question: jsonb('question').$type<AgentHeartbeatQuestion>(),
    error: jsonb('error').$type<AgentHeartbeatError>(),
    taskId: text('task_id'),
    workspace: jsonb('workspace').$type<AgentHeartbeatWorkspace>(),
    machine: text('machine'),
    agent: jsonb('agent').$type<AgentHeartbeatAgent>(),
    emittedAt: timestamp('emitted_at', { withTimezone: true }).notNull(),
    receivedAt: timestamp('received_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index('agent_heartbeat_reporter_name_received_at_idx').on(
      table.reporterName,
      table.receivedAt,
    ),
    index('agent_heartbeat_received_at_idx').on(table.receivedAt),
    uniqueIndex('agent_heartbeat_reported_by_session_id_seq_idx').on(
      table.reportedBy,
      table.sessionId,
      table.seq,
    ),
  ],
);
