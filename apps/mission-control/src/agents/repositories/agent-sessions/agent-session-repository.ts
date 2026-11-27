import { asc, gte, inArray } from 'drizzle-orm';

import type { AgentSessionState } from '#src/agents/contracts/agent-session.ts';
import { AgentSessionRows } from '#src/agents/repositories/agent-sessions/agent-session-rows.ts';
import { agentSessionTable } from '#src/agents/repositories/agent-sessions/agent-sessions-table.ts';
import type { Database } from '#src/platform/services/database/database.ts';

export interface AgentSessionRepository {
  /** Every row of each session where the session or any subagent was updated at or after `since`, oldest first. */
  listUpdatedSince(props: { since: Date }): Promise<AgentSessionState[]>;
}

export class DrizzleAgentSessionRepository implements AgentSessionRepository {
  private readonly database: Database;

  constructor(props: { database: Database }) {
    this.database = props.database;
  }

  async listUpdatedSince(props: { since: Date }): Promise<AgentSessionState[]> {
    const orm = this.database.orm;
    const updated = orm
      .selectDistinct({ sessionId: agentSessionTable.sessionId })
      .from(agentSessionTable)
      .where(gte(agentSessionTable.updatedAt, props.since));

    const rows = await orm
      .select()
      .from(agentSessionTable)
      .where(inArray(agentSessionTable.sessionId, updated))
      .orderBy(
        asc(agentSessionTable.startedAt),
        asc(agentSessionTable.agentId),
      );
    return rows.map((row) => AgentSessionRows.state(row));
  }
}
