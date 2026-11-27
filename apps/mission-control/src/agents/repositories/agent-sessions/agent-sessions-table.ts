import { agentHeartbeatStatuses } from '@good-ground-collective/agentic-communication-standards';
import {
  bigint,
  index,
  jsonb,
  pgTable,
  primaryKey,
  text,
  timestamp,
} from 'drizzle-orm/pg-core';

import type { AgentHeartbeatQuestion } from '#src/agents/contracts/agent-heartbeat.ts';

/** The `agent_id` of a session's own row. Subagents carry their own id; an empty string keeps the parent inside the primary key, where `null` could not be. */
export const parentAgentId = '';

/** The current state of each session and each subagent under it, as of the highest `seq` it has reported. */
export const agentSessionTable = pgTable(
  'agent_session',
  {
    sessionId: text('session_id').notNull(),
    agentId: text('agent_id').notNull().default(parentAgentId),
    agentName: text('agent_name').notNull(),
    benchId: text('bench_id'),
    harness: text('harness').notNull(),
    status: text('status', { enum: agentHeartbeatStatuses }).notNull(),
    summary: text('summary'),
    question: jsonb('question').$type<AgentHeartbeatQuestion>(),
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
    primaryKey({ columns: [table.sessionId, table.agentId] }),
    index('agent_session_updated_at_idx').on(table.updatedAt),
  ],
);
