import { fileURLToPath } from 'node:url';

import { eq } from 'drizzle-orm';
import pg from 'pg';

import { AgentHeartbeatFixtures } from '#src/agents/__tests__/support/agent-heartbeat-fixtures.ts';
import type { AgentHeartbeatRecord } from '#src/agents/contracts/agent-heartbeat.ts';
import { DrizzleAgentHeartbeatRepository } from '#src/agents/repositories/agent-heartbeats/agent-heartbeat-repository.ts';
import { agentHeartbeatTable } from '#src/agents/repositories/agent-heartbeats/agent-heartbeats-table.ts';
import { DrizzleAgentSessionRepository } from '#src/agents/repositories/agent-sessions/agent-session-repository.ts';
import { agentSessionTable } from '#src/agents/repositories/agent-sessions/agent-sessions-table.ts';
import { userTable } from '#src/auth/repositories/auth-store/auth-store-table.ts';
import { PostgresDatabase } from '#src/platform/services/database/database.ts';

const reporterId = '00000000-0000-4000-8000-0000000000b1';

/**
 * A migrated database of its own on the test Postgres, so test files running side by side
 * never reset each other's rows. It holds the bench principal that reports, and no
 * heartbeats or session state, after each reset.
 */
export class AgentRecordsDatabase {
  readonly database: PostgresDatabase;
  readonly heartbeats: DrizzleAgentHeartbeatRepository;
  readonly sessions: DrizzleAgentSessionRepository;

  private constructor(props: { url: string }) {
    this.database = new PostgresDatabase({
      url: props.url,
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
    await orm.delete(userTable).where(eq(userTable.id, reporterId));
    await orm.insert(userTable).values({
      id: reporterId,
      name: 'Studio Mac',
      email: 'studio-mac@example.com',
    });
  }

  async close(): Promise<void> {
    await this.database.close();
  }

  /** A heartbeat from the bench, as `seth-laptop`, with `payload` laid over the fixture's. */
  static record(
    payload: Parameters<typeof AgentHeartbeatFixtures.message>[0],
  ): AgentHeartbeatRecord {
    return {
      agentName: 'seth-laptop',
      benchId: 'studio-mac',
      reportedBy: reporterId,
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
