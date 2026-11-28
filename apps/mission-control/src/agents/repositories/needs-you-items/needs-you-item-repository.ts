import { and, desc, eq, isNull, sql } from 'drizzle-orm';
import { z } from 'zod';

import type { AgentHeartbeatQuestion } from '#src/agents/contracts/agent-heartbeat.ts';
import type { NeedsYouItem } from '#src/agents/contracts/needs-you-item.ts';
import { NeedsYouItemRows } from '#src/agents/repositories/needs-you-items/needs-you-item-rows.ts';
import { needsYouItemTable } from '#src/agents/repositories/needs-you-items/needs-you-items-table.ts';
import type { Database } from '#src/platform/services/database/database.ts';

const drizzleNeedsYouItemRepositoryPropsSchema = z.object({
  database: z.custom<Database>(),
});

export interface NeedsYouItemRepository {
  /** Opens an item for the session or subagent unless it already has an open one, and answers `null` when it has. A session is its `(reportedBy, sessionId)`. */
  open(props: {
    reportedBy: string;
    sessionId: string;
    agentId: string | null;
    question: AgentHeartbeatQuestion | null;
  }): Promise<NeedsYouItem | null>;
  /** Resolves the open item of one session or subagent, and answers it, or nothing when it had none. */
  resolveOne(props: {
    reportedBy: string;
    sessionId: string;
    agentId: string | null;
  }): Promise<NeedsYouItem[]>;
  /** Resolves every open item of a session and its subagents. */
  resolveSession(props: {
    reportedBy: string;
    sessionId: string;
  }): Promise<NeedsYouItem[]>;
  /** Open items, newest first. */
  listOpen(): Promise<NeedsYouItem[]>;
}

export class DrizzleNeedsYouItemRepository implements NeedsYouItemRepository {
  private readonly database: Database;

  constructor(props: z.input<typeof drizzleNeedsYouItemRepositoryPropsSchema>) {
    this.database =
      drizzleNeedsYouItemRepositoryPropsSchema.parse(props).database;
  }

  async open(props: {
    reportedBy: string;
    sessionId: string;
    agentId: string | null;
    question: AgentHeartbeatQuestion | null;
  }): Promise<NeedsYouItem | null> {
    const [row] = await this.database.orm
      .insert(needsYouItemTable)
      .values({
        reportedBy: props.reportedBy,
        sessionId: props.sessionId,
        agentId: NeedsYouItemRows.agentId(props.agentId),
        question: props.question,
      })
      .onConflictDoNothing({
        target: [
          needsYouItemTable.reportedBy,
          needsYouItemTable.sessionId,
          needsYouItemTable.agentId,
        ],
        where: isNull(needsYouItemTable.resolvedAt),
      })
      .returning();
    return row === undefined ? null : NeedsYouItemRows.item(row);
  }

  async resolveOne(props: {
    reportedBy: string;
    sessionId: string;
    agentId: string | null;
  }): Promise<NeedsYouItem[]> {
    return this.resolveWhere(
      and(
        eq(needsYouItemTable.reportedBy, props.reportedBy),
        eq(needsYouItemTable.sessionId, props.sessionId),
        eq(needsYouItemTable.agentId, NeedsYouItemRows.agentId(props.agentId)),
      ),
    );
  }

  async resolveSession(props: {
    reportedBy: string;
    sessionId: string;
  }): Promise<NeedsYouItem[]> {
    return this.resolveWhere(
      and(
        eq(needsYouItemTable.reportedBy, props.reportedBy),
        eq(needsYouItemTable.sessionId, props.sessionId),
      ),
    );
  }

  async listOpen(): Promise<NeedsYouItem[]> {
    const rows = await this.database.orm
      .select()
      .from(needsYouItemTable)
      .where(isNull(needsYouItemTable.resolvedAt))
      .orderBy(desc(needsYouItemTable.openedAt), desc(needsYouItemTable.id));
    return rows.map((row) => NeedsYouItemRows.item(row));
  }

  private async resolveWhere(
    scope: ReturnType<typeof and>,
  ): Promise<NeedsYouItem[]> {
    const rows = await this.database.orm
      .update(needsYouItemTable)
      .set({ resolvedAt: sql`now()` })
      .where(and(scope, isNull(needsYouItemTable.resolvedAt)))
      .returning();
    return rows.map((row) => NeedsYouItemRows.item(row));
  }
}
