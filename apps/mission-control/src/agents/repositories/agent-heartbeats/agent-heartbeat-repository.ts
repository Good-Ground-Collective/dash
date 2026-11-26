import type {
  AgentHeartbeat,
  AgentHeartbeatRecord,
} from '#src/agents/contracts/agent-heartbeat.ts';
import { AgentHeartbeatNotRecordedError } from '#src/agents/errors.ts';
import { agentHeartbeatTable } from '#src/agents/repositories/agent-heartbeats/agent-heartbeats-table.ts';
import type { Database } from '#src/platform/services/database/database.ts';

export interface AgentHeartbeatRepository {
  record(record: AgentHeartbeatRecord): Promise<AgentHeartbeat>;
}

export class DrizzleAgentHeartbeatRepository implements AgentHeartbeatRepository {
  private readonly database: Database;

  constructor(props: { database: Database }) {
    this.database = props.database;
  }

  async record(record: AgentHeartbeatRecord): Promise<AgentHeartbeat> {
    const [row] = await this.database.orm
      .insert(agentHeartbeatTable)
      .values(record)
      .returning();
    if (row === undefined) {
      throw new AgentHeartbeatNotRecordedError();
    }
    return {
      id: row.id,
      agentName: row.agentName,
      benchId: row.benchId,
      sentAt: row.sentAt?.toISOString() ?? null,
      receivedAt: row.receivedAt.toISOString(),
    };
  }
}
