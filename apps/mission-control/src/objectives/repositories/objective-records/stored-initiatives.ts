import { objectiveInitiativeTable } from '#src/objectives/repositories/objective-records/objective-records-table.ts';
import type { Database } from '#src/platform/services/database/database.ts';

/** Whether any reconcile has stored an initiative, in any status, for any connection. */
export interface StoredInitiatives {
  anyInitiative(): Promise<boolean>;
}

export class DrizzleStoredInitiatives implements StoredInitiatives {
  private readonly database: Database;

  constructor(props: { database: Database }) {
    this.database = props.database;
  }

  async anyInitiative(): Promise<boolean> {
    const rows = await this.database.orm
      .select({ nodeId: objectiveInitiativeTable.nodeId })
      .from(objectiveInitiativeTable)
      .limit(1);
    return rows.length > 0;
  }
}
