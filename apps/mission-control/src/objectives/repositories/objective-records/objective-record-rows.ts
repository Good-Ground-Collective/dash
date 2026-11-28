import type { InferSelectModel } from 'drizzle-orm';

import type {
  ActivityRecord,
  EpicRecord,
  InitiativeRecord,
  PlacementRecord,
  TicketRecord,
} from '#src/objectives/contracts/objective-records.ts';
import type {
  objectiveActivityTable,
  objectiveEpicTable,
  objectiveInitiativeTable,
  objectivePlacementTable,
  objectiveTicketTable,
} from '#src/objectives/repositories/objective-records/objective-records-table.ts';

type InitiativeRow = InferSelectModel<typeof objectiveInitiativeTable>;
type EpicRow = InferSelectModel<typeof objectiveEpicTable>;
type PlacementRow = InferSelectModel<typeof objectivePlacementTable>;
type TicketRow = InferSelectModel<typeof objectiveTicketTable>;
type ActivityRow = InferSelectModel<typeof objectiveActivityTable>;

/** Stored rows read back as the records a sync wrote. */
export class ObjectiveRecordRows {
  static initiative(row: InitiativeRow): InitiativeRecord {
    return {
      nodeId: row.nodeId,
      title: row.title,
      url: row.url,
      state: row.state,
      priority: row.priority,
      dueDate: row.dueDate,
      lastActivityAt: row.lastActivityAt.toISOString(),
    };
  }

  static epic(row: EpicRow): EpicRecord {
    return ObjectiveRecordRows.initiative(row);
  }

  static placement(row: PlacementRow): PlacementRecord {
    return {
      initiativeNodeId: row.initiativeNodeId,
      epicNodeId: row.epicNodeId,
    };
  }

  static ticket(row: TicketRow): TicketRecord {
    return {
      nodeId: row.nodeId,
      epicNodeId: row.epicNodeId,
      position: row.position,
      assignees: row.assignees,
      title: row.title,
      url: row.url,
      state: row.state,
      priority: row.priority,
      lastActivityAt: row.lastActivityAt.toISOString(),
    };
  }

  static activity(row: ActivityRow): ActivityRecord {
    return {
      ticketNodeId: row.ticketNodeId,
      kind: row.kind,
      occurredAt: row.occurredAt.toISOString(),
      actor: row.actor,
      url: row.url,
    };
  }
}
