import { and, asc, eq } from 'drizzle-orm';
import { z } from 'zod';

import type {
  WatchMode,
  WatchOverride,
  WatchOverrideKey,
  WatchRule,
} from '#src/github-feed/contracts/watched-checks.ts';
import {
  githubWatchOverrideTable,
  githubWatchRuleTable,
} from '#src/github-feed/repositories/watched-checks/watched-checks-table.ts';
import type { Database } from '#src/platform/services/database/database.ts';

const repositoryPropsSchema = z.object({
  database: z.custom<Database>(),
});

/** What each person watches. Every call touches only the rows of the person it names. */
export interface WatchedChecksRepository {
  /** Oldest first. */
  rulesFor(props: { userId: string }): Promise<WatchRule[]>;
  /** By repository, then check name. */
  overridesFor(props: { userId: string }): Promise<WatchOverride[]>;
  /** Adds the rule, or returns the person's existing rule with the same pattern. */
  addRule(props: { userId: string; pattern: string }): Promise<WatchRule>;
  /** Whether the person had that rule. */
  removeRule(props: { userId: string; id: string }): Promise<boolean>;
  /** Replaces what the person said about the check before. */
  setOverride(
    props: WatchOverrideKey & { userId: string; mode: WatchMode },
  ): Promise<void>;
  clearOverride(props: WatchOverrideKey & { userId: string }): Promise<void>;
}

export class DrizzleWatchedChecksRepository implements WatchedChecksRepository {
  private readonly database: Database;

  constructor(props: z.input<typeof repositoryPropsSchema>) {
    this.database = repositoryPropsSchema.parse(props).database;
  }

  async rulesFor(props: { userId: string }): Promise<WatchRule[]> {
    return this.database.orm
      .select({
        id: githubWatchRuleTable.id,
        pattern: githubWatchRuleTable.pattern,
      })
      .from(githubWatchRuleTable)
      .where(eq(githubWatchRuleTable.userId, props.userId))
      .orderBy(
        asc(githubWatchRuleTable.createdAt),
        asc(githubWatchRuleTable.pattern),
      );
  }

  async overridesFor(props: { userId: string }): Promise<WatchOverride[]> {
    return this.database.orm
      .select({
        repository: githubWatchOverrideTable.repository,
        checkName: githubWatchOverrideTable.checkName,
        mode: githubWatchOverrideTable.mode,
      })
      .from(githubWatchOverrideTable)
      .where(eq(githubWatchOverrideTable.userId, props.userId))
      .orderBy(
        asc(githubWatchOverrideTable.repository),
        asc(githubWatchOverrideTable.checkName),
      );
  }

  async addRule(props: {
    userId: string;
    pattern: string;
  }): Promise<WatchRule> {
    await this.database.orm
      .insert(githubWatchRuleTable)
      .values(props)
      .onConflictDoNothing();
    const [rule] = await this.database.orm
      .select({
        id: githubWatchRuleTable.id,
        pattern: githubWatchRuleTable.pattern,
      })
      .from(githubWatchRuleTable)
      .where(
        and(
          eq(githubWatchRuleTable.userId, props.userId),
          eq(githubWatchRuleTable.pattern, props.pattern),
        ),
      );
    if (rule === undefined) {
      throw new TypeError(`Watch rule ${props.pattern} was not stored`);
    }
    return rule;
  }

  async removeRule(props: { userId: string; id: string }): Promise<boolean> {
    const removed = await this.database.orm
      .delete(githubWatchRuleTable)
      .where(
        and(
          eq(githubWatchRuleTable.userId, props.userId),
          eq(githubWatchRuleTable.id, props.id),
        ),
      )
      .returning({ id: githubWatchRuleTable.id });
    return removed.length > 0;
  }

  async setOverride(
    props: WatchOverrideKey & { userId: string; mode: WatchMode },
  ): Promise<void> {
    await this.database.orm
      .insert(githubWatchOverrideTable)
      .values(props)
      .onConflictDoUpdate({
        target: [
          githubWatchOverrideTable.userId,
          githubWatchOverrideTable.repository,
          githubWatchOverrideTable.checkName,
        ],
        set: { mode: props.mode },
      });
  }

  async clearOverride(
    props: WatchOverrideKey & { userId: string },
  ): Promise<void> {
    await this.database.orm
      .delete(githubWatchOverrideTable)
      .where(
        and(
          eq(githubWatchOverrideTable.userId, props.userId),
          eq(githubWatchOverrideTable.repository, props.repository),
          eq(githubWatchOverrideTable.checkName, props.checkName),
        ),
      );
  }
}
