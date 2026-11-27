import { eq } from 'drizzle-orm';

import { OverlayNotSavedError } from '#src/objectives/errors.ts';
import type {
  Overlay,
  OverlayChanges,
} from '#src/objectives/contracts/objectives.ts';
import { objectiveOverlayTable } from '#src/objectives/repositories/objective-overlays/objective-overlays-table.ts';
import type { Database } from '#src/platform/services/database/database.ts';

export interface ObjectiveOverlayRepository {
  /** The person's overlays, by tracker node id. */
  listFor(props: { userId: string }): Promise<Map<string, Overlay>>;
  /** Applies `changes` to the person's overlay for `id`, creating it unparked and empty first. */
  save(props: {
    userId: string;
    id: string;
    changes: OverlayChanges;
  }): Promise<Overlay>;
}

export class DrizzleObjectiveOverlayRepository implements ObjectiveOverlayRepository {
  private readonly database: Database;

  constructor(props: { database: Database }) {
    this.database = props.database;
  }

  async listFor(props: { userId: string }): Promise<Map<string, Overlay>> {
    const rows = await this.database.orm
      .select()
      .from(objectiveOverlayTable)
      .where(eq(objectiveOverlayTable.userId, props.userId));
    return new Map(
      rows.map((row) => [
        row.nodeId,
        DrizzleObjectiveOverlayRepository.of(row),
      ]),
    );
  }

  async save(props: {
    userId: string;
    id: string;
    changes: OverlayChanges;
  }): Promise<Overlay> {
    const [row] = await this.database.orm
      .insert(objectiveOverlayTable)
      .values({ userId: props.userId, nodeId: props.id, ...props.changes })
      .onConflictDoUpdate({
        target: [objectiveOverlayTable.userId, objectiveOverlayTable.nodeId],
        set: { ...props.changes, updatedAt: new Date() },
      })
      .returning();
    if (row === undefined) {
      throw new OverlayNotSavedError();
    }
    return DrizzleObjectiveOverlayRepository.of(row);
  }

  private static of(row: typeof objectiveOverlayTable.$inferSelect): Overlay {
    return {
      id: row.nodeId,
      parked: row.parked,
      manualProgress: row.manualProgress,
      priority: row.priority,
      dueDate: row.dueDate,
    };
  }
}
