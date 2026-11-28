import { sql } from 'drizzle-orm';
import {
  boolean,
  check,
  index,
  integer,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';

/** Better Auth's `user` model, which is Dash's principal: a person or a service. */
export const userTable = pgTable(
  'user',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    name: text('name').notNull(),
    email: text('email').notNull().unique(),
    emailVerified: boolean('email_verified').notNull().default(false),
    image: text('image'),
    kind: text('kind', { enum: ['user', 'service'] })
      .notNull()
      .default('user'),
    theme: text('theme', { enum: ['characters'] })
      .notNull()
      .default('characters'),
    colorMode: text('color_mode', { enum: ['light', 'dark'] }),
    timeZone: text('time_zone').notNull().default('America/New_York'),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (table) => [
    check('user_kind_check', sql`${table.kind} in ('user', 'service')`),
    check(
      'user_color_mode_check',
      sql`${table.colorMode} is null or ${table.colorMode} in ('light', 'dark')`,
    ),
  ],
);

export const sessionTable = pgTable(
  'session',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    token: text('token').notNull().unique(),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
    ipAddress: text('ip_address'),
    userAgent: text('user_agent'),
    userId: uuid('user_id')
      .notNull()
      .references(() => userTable.id, { onDelete: 'cascade' }),
  },
  (table) => [index('session_user_id_idx').on(table.userId)],
);

export const accountTable = pgTable(
  'account',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    accountId: text('account_id').notNull(),
    providerId: text('provider_id').notNull(),
    userId: uuid('user_id')
      .notNull()
      .references(() => userTable.id, { onDelete: 'cascade' }),
    accessToken: text('access_token'),
    refreshToken: text('refresh_token'),
    idToken: text('id_token'),
    accessTokenExpiresAt: timestamp('access_token_expires_at', {
      withTimezone: true,
    }),
    refreshTokenExpiresAt: timestamp('refresh_token_expires_at', {
      withTimezone: true,
    }),
    scope: text('scope'),
    password: text('password'),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (table) => [index('account_user_id_idx').on(table.userId)],
);

export const verificationTable = pgTable(
  'verification',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    identifier: text('identifier').notNull(),
    value: text('value').notNull(),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (table) => [index('verification_identifier_idx').on(table.identifier)],
);

/** A person's WebAuthn credential, as the passkey plugin stores it. */
export const passkeyTable = pgTable(
  'passkey',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    name: text('name'),
    publicKey: text('public_key').notNull(),
    userId: uuid('user_id')
      .notNull()
      .references(() => userTable.id, { onDelete: 'cascade' }),
    credentialID: text('credential_id').notNull(),
    counter: integer('counter').notNull(),
    deviceType: text('device_type').notNull(),
    backedUp: boolean('backed_up').notNull(),
    transports: text('transports'),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
    aaguid: text('aaguid'),
  },
  (table) => [
    index('passkey_user_id_idx').on(table.userId),
    uniqueIndex('passkey_credential_id_idx').on(table.credentialID),
  ],
);

/** The hash of the one-time token that lets the first person enrol, while nobody has. */
export const setupTokenTable = pgTable(
  'setup_token',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    slot: text('slot').notNull().unique(),
    tokenHash: text('token_hash').notNull().unique(),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    check('setup_token_slot_check', sql`${table.slot} = 'first-person'`),
  ],
);

/**
 * A person's recovery codes, as HMACs keyed with the auth secret and bound to the person. A set
 * starts `pending` and turns `active` once its owner confirms they saved it, which deletes every
 * other set; a redeemed code turns `used`.
 */
export const recoveryCodeTable = pgTable(
  'recovery_code',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id')
      .notNull()
      .references(() => userTable.id, { onDelete: 'cascade' }),
    setId: uuid('set_id').notNull(),
    codeHash: text('code_hash').notNull(),
    state: text('state', { enum: ['pending', 'active', 'used'] }).notNull(),
    usedAt: timestamp('used_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    uniqueIndex('recovery_code_user_id_code_hash_idx').on(
      table.userId,
      table.codeHash,
    ),
    index('recovery_code_set_id_idx').on(table.setId),
    check(
      'recovery_code_state_check',
      sql`${table.state} in ('pending', 'active', 'used')`,
    ),
    check(
      'recovery_code_used_at_check',
      sql`(${table.state} = 'used') = (${table.usedAt} is not null)`,
    ),
  ],
);

/** A service principal's API key, as the api-key plugin stores it: a hash of the key, never the key itself. */
export const apikeyTable = pgTable(
  'apikey',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    configId: text('config_id').notNull().default('default'),
    name: text('name'),
    start: text('start'),
    referenceId: uuid('reference_id')
      .notNull()
      .references(() => userTable.id, { onDelete: 'cascade' }),
    prefix: text('prefix'),
    key: text('key').notNull(),
    refillInterval: integer('refill_interval'),
    refillAmount: integer('refill_amount'),
    lastRefillAt: timestamp('last_refill_at', { withTimezone: true }),
    enabled: boolean('enabled').notNull().default(true),
    rateLimitEnabled: boolean('rate_limit_enabled').notNull().default(true),
    rateLimitTimeWindow: integer('rate_limit_time_window'),
    rateLimitMax: integer('rate_limit_max'),
    requestCount: integer('request_count').notNull().default(0),
    remaining: integer('remaining'),
    lastRequest: timestamp('last_used_at', { withTimezone: true }),
    expiresAt: timestamp('expires_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
    permissions: text('permissions'),
    metadata: text('metadata'),
  },
  (table) => [
    uniqueIndex('apikey_key_idx').on(table.key),
    index('apikey_reference_id_idx').on(table.referenceId),
    index('apikey_config_id_idx').on(table.configId),
  ],
);
