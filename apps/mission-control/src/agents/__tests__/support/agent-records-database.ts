import { fileURLToPath } from 'node:url';

import { inArray, sql } from 'drizzle-orm';
import pg from 'pg';
import { z } from 'zod';

import { AgentHeartbeatFixtures } from '#src/agents/__tests__/support/agent-heartbeat-fixtures.ts';
import type { AgentHeartbeatRecord } from '#src/agents/contracts/agent-heartbeat.ts';
import { DrizzleAgentHeartbeatRepository } from '#src/agents/repositories/agent-heartbeats/agent-heartbeat-repository.ts';
import { agentHeartbeatTable } from '#src/agents/repositories/agent-heartbeats/agent-heartbeats-table.ts';
import { DrizzleAgentSessionRepository } from '#src/agents/repositories/agent-sessions/agent-session-repository.ts';
import { agentSessionTable } from '#src/agents/repositories/agent-sessions/agent-sessions-table.ts';
import { userTable } from '#src/auth/repositories/auth-store/auth-store-table.ts';
import { PostgresDatabase } from '#src/platform/services/database/database.ts';

const agentRecordsDatabasePropsSchema = z.object({ url: z.url() });

/** The principals that report in these tests: the bench, and a second key that must never see or move the bench's sessions. */
export const reporterIds = {
  bench: '00000000-0000-4000-8000-0000000000b1',
  other: '00000000-0000-4000-8000-0000000000b2',
} as const;

/**
 * A migrated database of its own on the test Postgres, so test files running side by side
 * never reset each other's rows. It holds the principals that report, and no heartbeats or
 * session state, after each reset.
 */
export class AgentRecordsDatabase {
  readonly database: PostgresDatabase;
  readonly heartbeats: DrizzleAgentHeartbeatRepository;
  readonly sessions: DrizzleAgentSessionRepository;

  private constructor(props: z.input<typeof agentRecordsDatabasePropsSchema>) {
    const parsed = agentRecordsDatabasePropsSchema.parse(props);
    this.database = new PostgresDatabase({
      url: parsed.url,
      queryTimeoutMilliseconds: 0,
    });
    this.heartbeats = new DrizzleAgentHeartbeatRepository({
      database: this.database,
    });
    this.sessions = new DrizzleAgentSessionRepository({
      database: this.database,
    });
  }

  async reset(): Promise<void> {
    const orm = this.database.orm;
    await orm.delete(agentHeartbeatTable);
    await orm.delete(agentSessionTable);
    await orm
      .delete(userTable)
      .where(inArray(userTable.id, Object.values(reporterIds)));
    await orm.insert(userTable).values([
      {
        id: reporterIds.bench,
        name: 'Studio Mac',
        email: 'studio-mac@example.com',
      },
      {
        id: reporterIds.other,
        name: 'Other bench',
        email: 'other-bench@example.com',
      },
    ]);
  }

  /** Sets when Mission Control last heard from `sessionId`, on every row it has. */
  async heardAt(props: { sessionId: string; at: Date }): Promise<void> {
    await this.database.orm.execute(
      sql`update agent_session set updated_at = ${props.at} where session_id = ${props.sessionId}`,
    );
  }

  async close(): Promise<void> {
    await this.database.close();
  }

  /** A heartbeat from the bench, as `seth-laptop`, with `payload` laid over the fixture's and `reporter` laid over the bench's. */
  static record(
    payload: Parameters<typeof AgentHeartbeatFixtures.message>[0],
    reporter: Partial<Omit<AgentHeartbeatRecord, 'message'>> = {},
  ): AgentHeartbeatRecord {
    return {
      reporterName: 'seth-laptop',
      benchId: 'studio-mac',
      reportedBy: reporterIds.bench,
      ...reporter,
      message: AgentHeartbeatFixtures.message(payload),
    };
  }

  /** The test database once the suite has opened it. */
  static required(
    store: AgentRecordsDatabase | undefined,
  ): AgentRecordsDatabase {
    if (store === undefined) {
      throw new TypeError('Set DASH_TEST_DATABASE_URL to run repository tests');
    }
    return store;
  }

  /** Creates `name` on the server at `serverUrl` when it is missing, and migrates it. */
  static async open(props: {
    serverUrl: string;
    name: string;
  }): Promise<AgentRecordsDatabase> {
    const server = new pg.Client({ connectionString: props.serverUrl });
    await server.connect();
    try {
      const existing = await server.query(
        'select 1 from pg_database where datname = $1',
        [props.name],
      );
      if (existing.rowCount === 0) {
        await server.query(`create database "${props.name}"`);
      }
    } finally {
      await server.end();
    }

    const url = new URL(props.serverUrl);
    url.pathname = `/${props.name}`;
    const opened = new AgentRecordsDatabase({ url: url.toString() });
    await opened.database.migrate({
      migrationsFolder: fileURLToPath(
        new URL('../../../../drizzle', import.meta.url),
      ),
    });
    return opened;
  }
}
