import { desc } from 'drizzle-orm';

import type { Heartbeat } from '#src/heartbeat/contracts/heartbeat.ts';
import { heartbeatsTable } from '#src/heartbeat/repositories/heartbeats/heartbeats-table.ts';
import type { Database } from '#src/platform/services/database/database.ts';

export interface HeartbeatRepository {
  record(props: { firedAt: Date }): Promise<Heartbeat>;
  listRecent(props: { limit: number }): Promise<Heartbeat[]>;
}

export class DrizzleHeartbeatRepository implements HeartbeatRepository {
  private readonly database: Database;

  constructor(props: { database: Database }) {
    this.database = props.database;
  }

  async listRecent(props: { limit: number }): Promise<Heartbeat[]> {
    const rows = await this.database.orm
      .select()
      .from(heartbeatsTable)
      .orderBy(desc(heartbeatsTable.firedAt))
      .limit(props.limit);
    return rows.map((row) => this.toHeartbeat(row));
  }

  async record(props: { firedAt: Date }): Promise<Heartbeat> {
    const [row] = await this.database.orm
      .insert(heartbeatsTable)
      .values({ firedAt: props.firedAt })
      .returning();
    if (row === undefined) {
      throw new Error('Insert into example_heartbeats returned no row');
    }
    return this.toHeartbeat(row);
  }

  private toHeartbeat(row: typeof heartbeatsTable.$inferSelect): Heartbeat {
    return {
      id: row.id,
      firedAt: row.firedAt.toISOString(),
      recordedAt: row.recordedAt.toISOString(),
    };
  }
}
