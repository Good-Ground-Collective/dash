import { sql } from 'drizzle-orm';
import {
  check,
  pgTable,
  primaryKey,
  text,
  timestamp,
  unique,
  uuid,
} from 'drizzle-orm/pg-core';

import { userTable } from '#src/auth/repositories/auth-store/auth-store-table.ts';

/** A check name, exact or ending in `*`, that a person watches on every repository's default branch. */
export const githubWatchRuleTable = pgTable(
  'github_watch_rule',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id')
      .notNull()
      .references(() => userTable.id, { onDelete: 'cascade' }),
    pattern: text('pattern').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    unique('github_watch_rule_user_pattern_unique').on(
      table.userId,
      table.pattern,
    ),
  ],
);

/** One repository's exception to the person's rules: watch a check the rules skip, or ignore one they match. Checks are identified by name, so the key is the repository's full name and the check's name. */
export const githubWatchOverrideTable = pgTable(
  'github_watch_override',
  {
    userId: uuid('user_id')
      .notNull()
      .references(() => userTable.id, { onDelete: 'cascade' }),
    repository: text('repository').notNull(),
    checkName: text('check_name').notNull(),
    mode: text('mode', { enum: ['watch', 'ignore'] }).notNull(),
  },
  (table) => [
    primaryKey({ columns: [table.userId, table.repository, table.checkName] }),
    check(
      'github_watch_override_mode_check',
      sql`${table.mode} in ('watch', 'ignore')`,
    ),
  ],
);
