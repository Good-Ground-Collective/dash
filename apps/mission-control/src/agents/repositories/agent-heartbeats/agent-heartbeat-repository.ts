import { and, eq, lt, sql } from 'drizzle-orm';
import type { NodePgDatabase } from 'drizzle-orm/node-postgres';
import { z } from 'zod';

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

const drizzleAgentHeartbeatRepositoryPropsSchema = z.object({
  database: z.custom<Database>(),
});

/** A stored heartbeat, with the session state it moved forward. `session` is `null` for a duplicate, or for a heartbeat older than the state already held. */
export interface RecordedAgentHeartbeat extends AgentHeartbeatReport {
  session: AgentSessionState | null;
}

export interface AgentHeartbeatRepository {
  /** Stores a heartbeat unless the same principal already stored its `(sessionId, seq)`, and moves that principal's session or subagent state forward when its `seq` is the highest seen. A duplicate answers only the caller's own row, and no principal can read or move another's. */
  record(record: AgentHeartbeatRecord): Promise<RecordedAgentHeartbeat>;
  /** Deletes heartbeats received before `cutoff`, and answers how many. Session state stays. */
  deleteReceivedBefore(props: { cutoff: Date }): Promise<number>;
}

export class DrizzleAgentHeartbeatRepository implements AgentHeartbeatRepository {
  private readonly database: Database;

  constructor(
    props: z.input<typeof drizzleAgentHeartbeatRepositoryPropsSchema>,
  ) {
    this.database =
      drizzleAgentHeartbeatRepositoryPropsSchema.parse(props).database;
  }

  async record(record: AgentHeartbeatRecord): Promise<RecordedAgentHeartbeat> {
    return this.database.orm.transaction(async (transaction) => {
      const [inserted] = await transaction
        .insert(agentHeartbeatTable)
        .values(AgentHeartbeatRows.row(record))
        .onConflictDoNothing({
          target: [
            agentHeartbeatTable.reportedBy,
            agentHeartbeatTable.sessionId,
            agentHeartbeatTable.seq,
          ],
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
          eq(agentHeartbeatTable.reportedBy, props.record.reportedBy),
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
        target: [
          agentSessionTable.reportedBy,
          agentSessionTable.sessionId,
          agentSessionTable.agentId,
        ],
        set: {
          reporterName: sql`excluded.reporter_name`,
          benchId: sql`excluded.bench_id`,
          harness: sql`excluded.harness`,
          status: sql`excluded.status`,
          liveness: 'live',
          livenessChangedAt: sql`case when ${agentSessionTable.liveness} <> 'live' then now() else ${agentSessionTable.livenessChangedAt} end`,
          summary: sql`coalesce(excluded.summary, ${agentSessionTable.summary})`,
          question: sql`excluded.question`,
          error: sql`excluded.error`,
          taskId: sql`coalesce(excluded.task_id, ${agentSessionTable.taskId})`,
          workspace: sql`coalesce(excluded.workspace, ${agentSessionTable.workspace})`,
          machine: sql`coalesce(excluded.machine, ${agentSessionTable.machine})`,
          agent: sql`coalesce(excluded.agent, ${agentSessionTable.agent})`,
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
