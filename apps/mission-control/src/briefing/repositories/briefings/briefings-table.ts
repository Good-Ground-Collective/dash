import { sql } from 'drizzle-orm';
import {
  bigint,
  check,
  index,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  uuid,
} from 'drizzle-orm/pg-core';

import { userTable } from '#src/auth/repositories/auth-store/auth-store-table.ts';
import type { BriefingCounts } from '#src/briefing/contracts/briefing-snapshot.ts';
import type {
  BriefingParagraph,
  BriefingPrices,
  BriefingSections,
} from '#src/briefing/contracts/briefings.ts';

/**
 * One row per briefing run: written by a scheduled or manual run, or when a run was skipped
 * because the month's budget was spent. Cost is integer micro-USD and the prices the run was
 * charged at are kept beside it. Rows are deleted after 30 days, or at the start of the
 * budget month if that is earlier, so pruning never lowers the month's spend.
 */
export const briefingTable = pgTable(
  'briefing',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id')
      .notNull()
      .references(() => userTable.id, { onDelete: 'cascade' }),
    trigger: text('trigger', { enum: ['scheduled', 'manual'] }).notNull(),
    status: text('status', {
      enum: ['succeeded', 'failed', 'skipped_over_budget'],
    }).notNull(),
    startedAt: timestamp('started_at', { withTimezone: true }).notNull(),
    finishedAt: timestamp('finished_at', { withTimezone: true }).notNull(),
    snapshotAt: timestamp('snapshot_at', { withTimezone: true }),
    model: text('model'),
    inputTokens: integer('input_tokens').notNull().default(0),
    cachedInputTokens: integer('cached_input_tokens').notNull().default(0),
    outputTokens: integer('output_tokens').notNull().default(0),
    reasoningTokens: integer('reasoning_tokens').notNull().default(0),
    costMicroUsd: bigint('cost_micro_usd', { mode: 'number' })
      .notNull()
      .default(0),
    prices: jsonb('prices').$type<BriefingPrices>(),
    sourceCounts: jsonb('source_counts').$type<BriefingCounts>(),
    sections: jsonb('sections').$type<BriefingSections>(),
    paragraphs: jsonb('paragraphs').$type<BriefingParagraph[]>(),
    unknownRefs: integer('unknown_refs').notNull().default(0),
    error: text('error'),
  },
  (table) => [
    index('briefing_user_id_started_at_idx').on(table.userId, table.startedAt),
    index('briefing_started_at_idx').on(table.startedAt),
    check(
      'briefing_trigger_check',
      sql`${table.trigger} in ('scheduled', 'manual')`,
    ),
    check(
      'briefing_status_check',
      sql`${table.status} in ('succeeded', 'failed', 'skipped_over_budget')`,
    ),
    check(
      'briefing_tokens_check',
      sql`${table.inputTokens} >= 0 and ${table.cachedInputTokens} >= 0 and ${table.outputTokens} >= 0 and ${table.reasoningTokens} >= 0`,
    ),
    check('briefing_cost_check', sql`${table.costMicroUsd} >= 0`),
    check('briefing_unknown_refs_check', sql`${table.unknownRefs} >= 0`),
    check(
      'briefing_error_check',
      sql`${table.status} = 'succeeded' or ${table.error} is not null`,
    ),
  ],
);
