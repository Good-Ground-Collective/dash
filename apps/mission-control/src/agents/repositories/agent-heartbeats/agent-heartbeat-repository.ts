import { and, eq, lt, sql } from 'drizzle-orm';
import type { NodePgDatabase } from 'drizzle-orm/node-postgres';

import type {
  AgentHeartbeatRecord,
  AgentHeartbeatReport,
} from '#src/agents/contracts/agent-heartbeat.ts';
import type { AgentSessionState } from '#src/agents/contracts/agent-session.ts';
import { AgentHeartbeatNotRecordedError } from '#src/agents/errors.ts';
import { AgentHeartbeatRows } from '#src/agents/repositories/agent-heartbeats/agent-heartbeat-rows.ts';
import { agentHeartbeatTable } from '#src/agents/repositories/agent-heartbeats/agent-heartbeats-table.ts';
import { AgentSessionRows } from '#src/agents/repositories/agent-sessions/agent-session-rows.ts';
import { agentSessionTable } from '#src/agents/repositories/agent-sessions/agent-sessions-table.ts';
import type { Database } from '#src/platform/services/database/database.ts';

type Transaction = Parameters<Parameters<NodePgDatabase['transaction']>[0]>[0];

/** A stored heartbeat, with the session state it moved forward. `session` is `null` for a duplicate, or for a heartbeat older than the state already held. */
export interface RecordedAgentHeartbeat extends AgentHeartbeatReport {
  session: AgentSessionState | null;
}

export interface AgentHeartbeatRepository {
  /** Stores a heartbeat unless its `(sessionId, seq)` is already stored, and moves its session or subagent state forward when its `seq` is the highest seen. */
  record(record: AgentHeartbeatRecord): Promise<RecordedAgentHeartbeat>;
  /** Deletes heartbeats received before `cutoff`, and answers how many. Session state stays. */
  deleteReceivedBefore(props: { cutoff: Date }): Promise<number>;
}

export class DrizzleAgentHeartbeatRepository implements AgentHeartbeatRepository {
  private readonly database: Database;

  constructor(props: { database: Database }) {
    this.database = props.database;
  }

  async record(record: AgentHeartbeatRecord): Promise<RecordedAgentHeartbeat> {
    return this.database.orm.transaction(async (transaction) => {
      const [inserted] = await transaction
        .insert(agentHeartbeatTable)
        .values(AgentHeartbeatRows.row(record))
        .onConflictDoNothing({
          target: [agentHeartbeatTable.sessionId, agentHeartbeatTable.seq],
        })
        .returning();

      if (inserted === undefined) {
        return {
          outcome: 'duplicate',
          heartbeat: AgentHeartbeatRows.heartbeat(
            await DrizzleAgentHeartbeatRepository.stored({
              transaction,
              record,
            }),
          ),
          session: null,
        };
      }

      const session = await DrizzleAgentHeartbeatRepository.advance({
        transaction,
        record,
      });
      return {
        outcome: 'created',
        heartbeat: AgentHeartbeatRows.heartbeat(inserted),
        session,
      };
    });
  }

  async deleteReceivedBefore(props: { cutoff: Date }): Promise<number> {
    const deleted = await this.database.orm
      .delete(agentHeartbeatTable)
      .where(lt(agentHeartbeatTable.receivedAt, props.cutoff))
      .returning({ id: agentHeartbeatTable.id });
    return deleted.length;
  }

  private static async stored(props: {
    transaction: Transaction;
    record: AgentHeartbeatRecord;
  }): Promise<typeof agentHeartbeatTable.$inferSelect> {
    const { sessionId, seq } = props.record.message.payload;
    const [row] = await props.transaction
      .select()
      .from(agentHeartbeatTable)
      .where(
        and(
          eq(agentHeartbeatTable.sessionId, sessionId),
          eq(agentHeartbeatTable.seq, seq),
        ),
      );
    if (row === undefined) {
      throw new AgentHeartbeatNotRecordedError({ sessionId, seq });
    }
    return row;
  }

  /** One conditional upsert, so concurrent heartbeats for one row serialize on it and a lower `seq` never overwrites a higher one. */
  private static async advance(props: {
    transaction: Transaction;
    record: AgentHeartbeatRecord;
  }): Promise<AgentSessionState | null> {
    const [row] = await props.transaction
      .insert(agentSessionTable)
      .values(AgentSessionRows.row(props.record))
      .onConflictDoUpdate({
        target: [agentSessionTable.sessionId, agentSessionTable.agentId],
        set: {
          agentName: sql`excluded.agent_name`,
          benchId: sql`excluded.bench_id`,
          harness: sql`excluded.harness`,
          status: sql`excluded.status`,
          summary: sql`coalesce(excluded.summary, ${agentSessionTable.summary})`,
          question: sql`excluded.question`,
          highestSeq: sql`excluded.highest_seq`,
          reportedAt: sql`excluded.reported_at`,
          updatedAt: sql`now()`,
        },
        setWhere: sql`${agentSessionTable.highestSeq} < excluded.highest_seq`,
      })
      .returning();
    return row === undefined ? null : AgentSessionRows.state(row);
  }
}
