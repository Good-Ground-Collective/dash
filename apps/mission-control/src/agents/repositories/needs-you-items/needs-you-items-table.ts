import { sql } from 'drizzle-orm';
import {
  jsonb,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';

import type { AgentHeartbeatQuestion } from '#src/agents/contracts/agent-heartbeat.ts';
import { parentAgentId } from '#src/agents/repositories/agent-sessions/agent-sessions-table.ts';

/** One row per question an agent raised for a person. A session or subagent has at most one open row; resolved rows stay. `reported_by` has no foreign key, like `agent_session`. */
export const needsYouItemTable = pgTable(
  'needs_you_item',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    reportedBy: uuid('reported_by').notNull(),
    sessionId: text('session_id').notNull(),
    agentId: text('agent_id').notNull().default(parentAgentId),
    question: jsonb('question').$type<AgentHeartbeatQuestion>(),
    openedAt: timestamp('opened_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
    resolvedAt: timestamp('resolved_at', { withTimezone: true }),
  },
  (table) => [
    uniqueIndex('needs_you_item_open_idx')
      .on(table.reportedBy, table.sessionId, table.agentId)
      .where(sql`${table.resolvedAt} is null`),
  ],
);
