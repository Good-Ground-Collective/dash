import { and, asc, eq, inArray } from 'drizzle-orm';
import { z } from 'zod';

import { installRequestTable } from '#src/connections/repositories/install-requests/install-requests-table.ts';
import type { Database } from '#src/platform/services/database/database.ts';

/** A person's request that an organisation's owners install the app. `requestedAt` is an ISO timestamp. */
export interface InstallRequest {
  accountExternalId: string;
  requestedAt: string;
}

export interface InstallRequestRepository {
  /** Records the request, or moves `requestedAt` to now when the person asks again. */
  record(props: {
    userId: string;
    provider: string;
    accountExternalId: string;
  }): Promise<void>;
  /** The person's open requests, oldest first. */
  list(props: { userId: string; provider: string }): Promise<InstallRequest[]>;
  /** Forgets requests for accounts the app is now installed on. */
  clear(props: {
    userId: string;
    provider: string;
    accountExternalIds: readonly string[];
  }): Promise<void>;
}

const drizzleInstallRequestRepositoryPropsSchema = z.object({
  database: z.custom<Database>(),
});

export class DrizzleInstallRequestRepository implements InstallRequestRepository {
  private readonly database: Database;

  constructor(
    props: z.input<typeof drizzleInstallRequestRepositoryPropsSchema>,
  ) {
    this.database =
      drizzleInstallRequestRepositoryPropsSchema.parse(props).database;
  }

  async record(props: {
    userId: string;
    provider: string;
    accountExternalId: string;
  }): Promise<void> {
    const requestedAt = new Date();
    await this.database.orm
      .insert(installRequestTable)
      .values({ ...props, requestedAt })
      .onConflictDoUpdate({
        target: [
          installRequestTable.userId,
          installRequestTable.provider,
          installRequestTable.accountExternalId,
        ],
        set: { requestedAt },
      });
  }

  async list(props: {
    userId: string;
    provider: string;
  }): Promise<InstallRequest[]> {
    const rows = await this.database.orm
      .select({
        accountExternalId: installRequestTable.accountExternalId,
        requestedAt: installRequestTable.requestedAt,
      })
      .from(installRequestTable)
      .where(
        and(
          eq(installRequestTable.userId, props.userId),
          eq(installRequestTable.provider, props.provider),
        ),
      )
      .orderBy(asc(installRequestTable.requestedAt));
    return rows.map((row) => ({
      accountExternalId: row.accountExternalId,
      requestedAt: row.requestedAt.toISOString(),
    }));
  }

  async clear(props: {
    userId: string;
    provider: string;
    accountExternalIds: readonly string[];
  }): Promise<void> {
    if (props.accountExternalIds.length === 0) {
      return;
    }
    await this.database.orm
      .delete(installRequestTable)
      .where(
        and(
          eq(installRequestTable.userId, props.userId),
          eq(installRequestTable.provider, props.provider),
          inArray(installRequestTable.accountExternalId, [
            ...props.accountExternalIds,
          ]),
        ),
      );
  }
}
