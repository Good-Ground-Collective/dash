import { sql } from 'drizzle-orm';
import {
  boolean,
  check,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';

import { userTable } from '#src/auth/repositories/auth-store/auth-store-table.ts';

/**
 * A provider account Dash reads. `owned` connections are installations of the provider's app,
 * read with the app's credentials. `guest` connections (#27) will be personal tokens.
 */
export const connectionTable = pgTable(
  'connection',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    provider: text('provider').notNull(),
    kind: text('kind', { enum: ['owned', 'guest'] }).notNull(),
    installationId: text('installation_id'),
    accountExternalId: text('account_external_id').notNull(),
    accountLogin: text('account_login').notNull(),
    accountKind: text('account_kind', {
      enum: ['organization', 'user'],
    }).notNull(),
    accountUrl: text('account_url').notNull(),
    settingsUrl: text('settings_url'),
    repositorySelection: text('repository_selection', {
      enum: ['all', 'selected'],
    }),
    suspended: boolean('suspended').notNull().default(false),
    connectedBy: uuid('connected_by').references(() => userTable.id, {
      onDelete: 'set null',
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
    uniqueIndex('connection_provider_installation_id_idx').on(
      table.provider,
      table.installationId,
    ),
    check('connection_kind_check', sql`${table.kind} in ('owned', 'guest')`),
    check(
      'connection_owned_installation_check',
      sql`${table.kind} <> 'owned' or (${table.installationId} is not null and ${table.settingsUrl} is not null and ${table.repositorySelection} is not null)`,
    ),
  ],
);

/** The repositories a connection covers, replaced whenever the installation is read again. */
export const connectionRepositoryTable = pgTable(
  'connection_repository',
  {
    connectionId: uuid('connection_id')
      .notNull()
      .references(() => connectionTable.id, { onDelete: 'cascade' }),
    externalId: text('external_id').notNull(),
    fullName: text('full_name').notNull(),
    url: text('url').notNull(),
    defaultBranch: text('default_branch').notNull(),
    archived: boolean('archived').notNull(),
  },
  (table) => [primaryKey({ columns: [table.connectionId, table.externalId] })],
);

/** Someone asked an organisation owner to install the app on this account. #74 clears it when the installation arrives. */
export const installRequestTable = pgTable(
  'install_request',
  {
    userId: uuid('user_id')
      .notNull()
      .references(() => userTable.id, { onDelete: 'cascade' }),
    provider: text('provider').notNull(),
    accountExternalId: text('account_external_id').notNull(),
    requestedAt: timestamp('requested_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    primaryKey({
      columns: [table.userId, table.provider, table.accountExternalId],
    }),
  ],
);
