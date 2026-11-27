import { asc, gte, sql } from 'drizzle-orm';
import { z } from 'zod';

import type { AgentSessionState } from '#src/agents/contracts/agent-session.ts';
import { AgentSessionRows } from '#src/agents/repositories/agent-sessions/agent-session-rows.ts';
import { agentSessionTable } from '#src/agents/repositories/agent-sessions/agent-sessions-table.ts';
import type { Database } from '#src/platform/services/database/database.ts';

const drizzleAgentSessionRepositoryPropsSchema = z.object({
  database: z.custom<Database>(),
});

export interface AgentSessionRepository {
  /** Every row of each session where the session or any subagent was updated at or after `since`, oldest first. A session is its `(reportedBy, sessionId)`. */
  listUpdatedSince(props: { since: Date }): Promise<AgentSessionState[]>;
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
}
