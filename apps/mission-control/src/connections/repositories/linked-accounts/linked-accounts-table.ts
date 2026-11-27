import {
  pgTable,
  primaryKey,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';

import { userTable } from '#src/auth/repositories/auth-store/auth-store-table.ts';

/**
 * A Dash person's account on a provider, with the token that acts as them. Tokens are sealed
 * by `TokenCipher`; the columns never hold plaintext.
 */
export const linkedAccountTable = pgTable(
  'linked_account',
  {
    userId: uuid('user_id')
      .notNull()
      .references(() => userTable.id, { onDelete: 'cascade' }),
    provider: text('provider').notNull(),
    externalId: text('external_id').notNull(),
    login: text('login').notNull(),
    url: text('url').notNull(),
    sealedAccessToken: text('sealed_access_token').notNull(),
    accessTokenExpiresAt: timestamp('access_token_expires_at', {
      withTimezone: true,
    }),
    sealedRefreshToken: text('sealed_refresh_token'),
    refreshTokenExpiresAt: timestamp('refresh_token_expires_at', {
      withTimezone: true,
    }),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (table) => [
    primaryKey({ columns: [table.userId, table.provider] }),
    uniqueIndex('linked_account_provider_external_id_idx').on(
      table.provider,
      table.externalId,
    ),
  ],
);
