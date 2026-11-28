import { and, asc, eq, gte, lte, sql } from 'drizzle-orm';
import { z } from 'zod';

import type { AgentSessionState } from '#src/agents/contracts/agent-session.ts';
import type { AgentLiveness } from '#src/agents/definitions/agent-liveness/agent-liveness.ts';
import { AgentSessionRows } from '#src/agents/repositories/agent-sessions/agent-session-rows.ts';
import {
  agentSessionTable,
  parentAgentId,
} from '#src/agents/repositories/agent-sessions/agent-sessions-table.ts';
import type { Database } from '#src/platform/services/database/database.ts';

const drizzleAgentSessionRepositoryPropsSchema = z.object({
  database: z.custom<Database>(),
});

export interface AgentSessionRepository {
  /** Every row of each session where the session or any subagent was updated at or after `since`, oldest first. A session is its `(reportedBy, sessionId)`. */
  listUpdatedSince(props: { since: Date }): Promise<AgentSessionState[]>;
  /** Marks every `working` row last updated at or before `staleBefore` as `stale`, and at or before `lostBefore` as `lost`. Rows in any other status, and rows already marked so, are left alone. A session's own row is also left alone while any of its subagents was updated after `staleBefore`. Answers the rows whose liveness changed. */
  markSilent(props: {
    staleBefore: Date;
    lostBefore: Date;
  }): Promise<AgentSessionState[]>;
}

export class DrizzleAgentSessionRepository implements AgentSessionRepository {
  private readonly database: Database;

  constructor(props: z.input<typeof drizzleAgentSessionRepositoryPropsSchema>) {
    this.database =
      drizzleAgentSessionRepositoryPropsSchema.parse(props).database;
  }

  async listUpdatedSince(props: { since: Date }): Promise<AgentSessionState[]> {
    const orm = this.database.orm;
    const updated = orm
      .selectDistinct({
        reportedBy: agentSessionTable.reportedBy,
        sessionId: agentSessionTable.sessionId,
      })
      .from(agentSessionTable)
      .where(gte(agentSessionTable.updatedAt, props.since));

    const rows = await orm
      .select()
      .from(agentSessionTable)
      .where(
        sql`(${agentSessionTable.reportedBy}, ${agentSessionTable.sessionId}) in ${updated}`,
      )
      .orderBy(
        asc(agentSessionTable.startedAt),
        asc(agentSessionTable.agentId),
      );
    return rows.map((row) => AgentSessionRows.state(row));
  }

  async markSilent(props: {
    staleBefore: Date;
    lostBefore: Date;
  }): Promise<AgentSessionState[]> {
    const silence = sql<AgentLiveness>`case when ${lte(agentSessionTable.updatedAt, props.lostBefore)} then 'lost' else 'stale' end`;
    const rows = await this.database.orm
      .update(agentSessionTable)
      .set({ liveness: silence, livenessChangedAt: sql`now()` })
      .where(
        and(
          eq(agentSessionTable.status, 'working'),
          lte(agentSessionTable.updatedAt, props.staleBefore),
          sql`(agent_session.agent_id <> ${parentAgentId} or not exists (select 1 from agent_session child where child.reported_by = agent_session.reported_by and child.session_id = agent_session.session_id and child.agent_id <> ${parentAgentId} and child.updated_at > ${props.staleBefore}))`,
          sql`${agentSessionTable.liveness} <> ${silence}`,
        ),
      )
      .returning();
    return rows.map((row) => AgentSessionRows.state(row));
  }
}
