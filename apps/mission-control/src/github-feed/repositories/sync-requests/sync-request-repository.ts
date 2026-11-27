import { and, eq, gte, sql } from 'drizzle-orm';
import { z } from 'zod';

import { githubSyncRequestTable } from '#src/github-feed/repositories/sync-requests/sync-requests-table.ts';
import type { Database } from '#src/platform/services/database/database.ts';

const repositoryPropsSchema = z.object({
  database: z.custom<Database>(),
});

export interface SyncRequestRepository {
  /** Records that the connection changed at `requestedAt`, keeping the latest such moment. */
  request(props: { connectionId: string; requestedAt: Date }): Promise<void>;
  requestedSince(props: {
    connectionId: string;
    since: Date;
  }): Promise<boolean>;
}

export class DrizzleSyncRequestRepository implements SyncRequestRepository {
  private readonly database: Database;

  constructor(props: z.input<typeof repositoryPropsSchema>) {
    this.database = repositoryPropsSchema.parse(props).database;
  }

  async request(props: {
    connectionId: string;
    requestedAt: Date;
  }): Promise<void> {
    await this.database.orm
      .insert(githubSyncRequestTable)
      .values(props)
      .onConflictDoUpdate({
        target: githubSyncRequestTable.connectionId,
        set: {
          requestedAt: sql`greatest(${githubSyncRequestTable.requestedAt}, excluded.requested_at)`,
        },
      });
  }

  async requestedSince(props: {
    connectionId: string;
    since: Date;
  }): Promise<boolean> {
    const rows = await this.database.orm
      .select({ connectionId: githubSyncRequestTable.connectionId })
      .from(githubSyncRequestTable)
      .where(
        and(
          eq(githubSyncRequestTable.connectionId, props.connectionId),
          gte(githubSyncRequestTable.requestedAt, props.since),
        ),
      )
      .limit(1);
    return rows.length > 0;
  }
}
