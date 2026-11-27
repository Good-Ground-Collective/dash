import type { ConnectedAccount } from '@dash/integrations-core';
import { and, eq } from 'drizzle-orm';

import { linkedAccountTable } from '#src/connections/repositories/linked-accounts/linked-accounts-table.ts';
import type { Database } from '#src/platform/services/database/database.ts';

/** A person's provider account and their token, sealed. Expiry times are ISO timestamps, null when the token never expires. */
export interface StoredLinkedAccount {
  userId: string;
  account: ConnectedAccount;
  sealedAccessToken: string;
  accessTokenExpiresAt: string | null;
  sealedRefreshToken: string | null;
  refreshTokenExpiresAt: string | null;
}

export interface LinkedAccountRepository {
  find(props: {
    userId: string;
    provider: string;
  }): Promise<StoredLinkedAccount | null>;
  /** Who, if anyone, has linked this provider account. */
  findOwner(props: {
    provider: string;
    externalId: string;
  }): Promise<string | null>;
  /** Creates or replaces the person's link for the account's provider. */
  save(linked: StoredLinkedAccount): Promise<void>;
}

export class DrizzleLinkedAccountRepository implements LinkedAccountRepository {
  private readonly database: Database;

  constructor(props: { database: Database }) {
    this.database = props.database;
  }

  async find(props: {
    userId: string;
    provider: string;
  }): Promise<StoredLinkedAccount | null> {
    const [row] = await this.database.orm
      .select()
      .from(linkedAccountTable)
      .where(
        and(
          eq(linkedAccountTable.userId, props.userId),
          eq(linkedAccountTable.provider, props.provider),
        ),
      );
    if (row === undefined) {
      return null;
    }
    return {
      userId: row.userId,
      account: {
        provider: row.provider,
        externalId: row.externalId,
        url: row.url,
        login: row.login,
        kind: 'user',
      },
      sealedAccessToken: row.sealedAccessToken,
      accessTokenExpiresAt: row.accessTokenExpiresAt?.toISOString() ?? null,
      sealedRefreshToken: row.sealedRefreshToken,
      refreshTokenExpiresAt: row.refreshTokenExpiresAt?.toISOString() ?? null,
    };
  }

  async findOwner(props: {
    provider: string;
    externalId: string;
  }): Promise<string | null> {
    const [row] = await this.database.orm
      .select({ userId: linkedAccountTable.userId })
      .from(linkedAccountTable)
      .where(
        and(
          eq(linkedAccountTable.provider, props.provider),
          eq(linkedAccountTable.externalId, props.externalId),
        ),
      );
    return row?.userId ?? null;
  }

  async save(linked: StoredLinkedAccount): Promise<void> {
    const columns = {
      externalId: linked.account.externalId,
      login: linked.account.login,
      url: linked.account.url,
      sealedAccessToken: linked.sealedAccessToken,
      accessTokenExpiresAt: this.date(linked.accessTokenExpiresAt),
      sealedRefreshToken: linked.sealedRefreshToken,
      refreshTokenExpiresAt: this.date(linked.refreshTokenExpiresAt),
      updatedAt: new Date(),
    };
    await this.database.orm
      .insert(linkedAccountTable)
      .values({
        ...columns,
        userId: linked.userId,
        provider: linked.account.provider,
      })
      .onConflictDoUpdate({
        target: [linkedAccountTable.userId, linkedAccountTable.provider],
        set: columns,
      });
  }

  private date(value: string | null): Date | null {
    return value === null ? null : new Date(value);
  }
}
