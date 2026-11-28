import { and, desc, eq, gte, lt, ne, sql } from 'drizzle-orm';
import { z } from 'zod';

import type { BriefingCounts } from '#src/briefing/contracts/briefing-snapshot.ts';
import type {
  BriefingParagraph,
  BriefingPrices,
  BriefingRun,
  BriefingSections,
} from '#src/briefing/contracts/briefings.ts';
import { BriefingNotSavedError } from '#src/briefing/errors.ts';
import { briefingTable } from '#src/briefing/repositories/briefings/briefings-table.ts';
import type { Database } from '#src/platform/services/database/database.ts';

const repositoryPropsSchema = z.object({
  database: z.custom<Database>(),
});

const microUsdPerUsd = 1_000_000;

/** A run as the generation workflow records it. */
export interface NewBriefingRun {
  userId: string;
  trigger: BriefingRun['trigger'];
  status: BriefingRun['status'];
  startedAt: Date;
  finishedAt: Date;
  snapshotAt: Date | null;
  model: string | null;
  tokens: BriefingRun['tokens'];
  costMicroUsd: number;
  prices: BriefingPrices | null;
  sourceCounts: BriefingCounts | null;
  sections: BriefingSections | null;
  paragraphs: BriefingParagraph[] | null;
  unknownRefs: number;
  error: string | null;
}

export interface BriefingRepository {
  /** Stores the run and returns it as it was read back. */
  record(run: NewBriefingRun): Promise<BriefingRun>;
  /** The person's newest run that produced a briefing. */
  latestSucceeded(props: { userId: string }): Promise<BriefingRun | null>;
  /** The person's newest run of any status. */
  latestRun(props: { userId: string }): Promise<BriefingRun | null>;
  /** The person's runs, newest first. */
  history(props: { userId: string; limit: number }): Promise<BriefingRun[]>;
  /** Micro-USD spent by every person's runs started at or after `since`, failed runs included. */
  spentSince(props: { since: Date }): Promise<number>;
  /** How many runs started at or after `since` called the model, failed runs included; runs skipped over budget are not counted. */
  runsSince(props: { since: Date }): Promise<number>;
  /** Deletes runs started strictly before `cutoff` and says how many went. */
  deleteStartedBefore(props: { cutoff: Date }): Promise<number>;
}

type BriefingRow = typeof briefingTable.$inferSelect;

export class DrizzleBriefingRepository implements BriefingRepository {
  private readonly database: Database;

  constructor(props: z.input<typeof repositoryPropsSchema>) {
    this.database = repositoryPropsSchema.parse(props).database;
  }

  async record(run: NewBriefingRun): Promise<BriefingRun> {
    const [row] = await this.database.orm
      .insert(briefingTable)
      .values({
        userId: run.userId,
        trigger: run.trigger,
        status: run.status,
        startedAt: run.startedAt,
        finishedAt: run.finishedAt,
        snapshotAt: run.snapshotAt,
        model: run.model,
        inputTokens: run.tokens.input,
        cachedInputTokens: run.tokens.cachedInput,
        outputTokens: run.tokens.output,
        reasoningTokens: run.tokens.reasoning,
        costMicroUsd: run.costMicroUsd,
        prices: run.prices,
        sourceCounts: run.sourceCounts,
        sections: run.sections,
        paragraphs: run.paragraphs,
        unknownRefs: run.unknownRefs,
        error: run.error,
      })
      .returning();
    if (row === undefined) {
      throw new BriefingNotSavedError();
    }
    return this.toRun(row);
  }

  async latestSucceeded(props: {
    userId: string;
  }): Promise<BriefingRun | null> {
    const [row] = await this.database.orm
      .select()
      .from(briefingTable)
      .where(
        and(
          eq(briefingTable.userId, props.userId),
          eq(briefingTable.status, 'succeeded'),
        ),
      )
      .orderBy(desc(briefingTable.startedAt), desc(briefingTable.id))
      .limit(1);
    return row === undefined ? null : this.toRun(row);
  }

  async latestRun(props: { userId: string }): Promise<BriefingRun | null> {
    const [run] = await this.history({ userId: props.userId, limit: 1 });
    return run ?? null;
  }

  async history(props: {
    userId: string;
    limit: number;
  }): Promise<BriefingRun[]> {
    const rows = await this.database.orm
      .select()
      .from(briefingTable)
      .where(eq(briefingTable.userId, props.userId))
      .orderBy(desc(briefingTable.startedAt), desc(briefingTable.id))
      .limit(props.limit);
    return rows.map((row) => this.toRun(row));
  }

  async spentSince(props: { since: Date }): Promise<number> {
    const [row] = await this.database.orm
      .select({
        spent: sql<string>`coalesce(sum(${briefingTable.costMicroUsd}), 0)`,
      })
      .from(briefingTable)
      .where(gte(briefingTable.startedAt, props.since));
    return Number(row?.spent ?? 0);
  }

  async runsSince(props: { since: Date }): Promise<number> {
    const [row] = await this.database.orm
      .select({ runs: sql<string>`count(*)` })
      .from(briefingTable)
      .where(
        and(
          gte(briefingTable.startedAt, props.since),
          ne(briefingTable.status, 'skipped_over_budget'),
        ),
      );
    return Number(row?.runs ?? 0);
  }

  async deleteStartedBefore(props: { cutoff: Date }): Promise<number> {
    const deleted = await this.database.orm
      .delete(briefingTable)
      .where(lt(briefingTable.startedAt, props.cutoff))
      .returning({ id: briefingTable.id });
    return deleted.length;
  }

  private toRun(row: BriefingRow): BriefingRun {
    return {
      id: row.id,
      trigger: row.trigger,
      status: row.status,
      startedAt: row.startedAt.toISOString(),
      finishedAt: row.finishedAt.toISOString(),
      snapshotAt: row.snapshotAt?.toISOString() ?? null,
      model: row.model,
      tokens: {
        input: row.inputTokens,
        cachedInput: row.cachedInputTokens,
        output: row.outputTokens,
        reasoning: row.reasoningTokens,
      },
      costUsd: row.costMicroUsd / microUsdPerUsd,
      prices: row.prices,
      sourceCounts: row.sourceCounts,
      sections: row.sections,
      paragraphs: row.paragraphs,
      unknownRefs: row.unknownRefs,
      error: row.error,
    };
  }
}
