import { and, asc, eq, inArray, type SQL, sql } from 'drizzle-orm';

import { connectionTable } from '#src/connections/repositories/connections/connections-table.ts';
import type {
  ObjectiveRecords,
  ObjectiveSyncTarget,
} from '#src/objectives/contracts/objective-records.ts';
import {
  objectiveActivityTable,
  objectiveEpicTable,
  objectiveInitiativeTable,
  objectivePlacementTable,
  objectiveSyncTable,
  objectiveTicketTable,
} from '#src/objectives/repositories/objective-records/objective-records-table.ts';
import { ObjectiveRecordRows } from '#src/objectives/repositories/objective-records/objective-record-rows.ts';
import type { Database } from '#src/platform/services/database/database.ts';

/** A connection a person made whose tracker Dash has tried to read, how that went, and what the last good read found. */
export interface ConnectionObjectives {
  connectionId: string;
  accountLogin: string;
  lastSyncedAt: string | null;
  lastError: string | null;
  truncated: boolean | null;
  records: ObjectiveRecords;
}

export interface ObjectiveRecordReader {
  /** Owned connections of `providers`, least recently tried first, so a capped run still reaches every one in turn. */
  syncTargets(props: {
    providers: readonly string[];
    connectionId?: string;
    installationId?: string;
    connectedBy?: string;
    limit: number;
  }): Promise<ObjectiveSyncTarget[]>;
  /** Every connection `connectedBy` made that has been read for objectives, with its stored records. */
  recordsFor(props: { connectedBy: string }): Promise<ConnectionObjectives[]>;
}

export class DrizzleObjectiveRecordReader implements ObjectiveRecordReader {
  private readonly database: Database;

  constructor(props: { database: Database }) {
    this.database = props.database;
  }

  async syncTargets(props: {
    providers: readonly string[];
    connectionId?: string;
    installationId?: string;
    connectedBy?: string;
    limit: number;
  }): Promise<ObjectiveSyncTarget[]> {
    if (props.providers.length === 0) {
      return [];
    }
    const filters: SQL[] = [
      eq(connectionTable.kind, 'owned'),
      inArray(connectionTable.provider, [...props.providers]),
    ];
    if (props.connectionId !== undefined) {
      filters.push(eq(connectionTable.id, props.connectionId));
    }
    if (props.installationId !== undefined) {
      filters.push(eq(connectionTable.installationId, props.installationId));
    }
    if (props.connectedBy !== undefined) {
      filters.push(eq(connectionTable.connectedBy, props.connectedBy));
    }

    const rows = await this.database.orm
      .select({ connection: connectionTable })
      .from(connectionTable)
      .leftJoin(
        objectiveSyncTable,
        eq(objectiveSyncTable.connectionId, connectionTable.id),
      )
      .where(and(...filters))
      .orderBy(sql`${objectiveSyncTable.lastAttemptedAt} asc nulls first`)
      .limit(props.limit);
    return rows.map(({ connection }) => ({
      connectionId: connection.id,
      provider: connection.provider,
      installationId: connection.installationId,
      account: { login: connection.accountLogin, kind: connection.accountKind },
      connectedBy: connection.connectedBy,
      suspended: connection.suspended,
    }));
  }

  async recordsFor(props: {
    connectedBy: string;
  }): Promise<ConnectionObjectives[]> {
    const connections = await this.database.orm
      .select({ connection: connectionTable, sync: objectiveSyncTable })
      .from(connectionTable)
      .innerJoin(
        objectiveSyncTable,
        eq(objectiveSyncTable.connectionId, connectionTable.id),
      )
      .where(eq(connectionTable.connectedBy, props.connectedBy))
      .orderBy(asc(connectionTable.accountLogin));
    if (connections.length === 0) {
      return [];
    }
    const rows = await this.rowsWithin(
      connections.map(({ connection }) => connection.id),
    );

    return connections.map(({ connection, sync }) => {
      const of = <T extends { connectionId: string }>(table: readonly T[]) =>
        table.filter((row) => row.connectionId === connection.id);
      return {
        connectionId: connection.id,
        accountLogin: connection.accountLogin,
        lastSyncedAt: sync.lastSyncedAt?.toISOString() ?? null,
        lastError: sync.lastError,
        truncated: sync.truncated,
        records: {
          initiatives: of(rows.initiatives).map(ObjectiveRecordRows.initiative),
          epics: of(rows.epics).map(ObjectiveRecordRows.epic),
          placements: of(rows.placements).map(ObjectiveRecordRows.placement),
          tickets: of(rows.tickets).map(ObjectiveRecordRows.ticket),
          activity: of(rows.activity).map(ObjectiveRecordRows.activity),
        },
      };
    });
  }

  private async rowsWithin(ids: readonly string[]) {
    const orm = this.database.orm;
    const within = [...ids];
    const [initiatives, epics, placements, tickets, activity] =
      await Promise.all([
        orm
          .select()
          .from(objectiveInitiativeTable)
          .where(inArray(objectiveInitiativeTable.connectionId, within))
          .orderBy(asc(objectiveInitiativeTable.nodeId)),
        orm
          .select()
          .from(objectiveEpicTable)
          .where(inArray(objectiveEpicTable.connectionId, within))
          .orderBy(asc(objectiveEpicTable.nodeId)),
        orm
          .select()
          .from(objectivePlacementTable)
          .where(inArray(objectivePlacementTable.connectionId, within)),
        orm
          .select()
          .from(objectiveTicketTable)
          .where(inArray(objectiveTicketTable.connectionId, within))
          .orderBy(
            asc(objectiveTicketTable.epicNodeId),
            asc(objectiveTicketTable.position),
          ),
        orm
          .select()
          .from(objectiveActivityTable)
          .where(inArray(objectiveActivityTable.connectionId, within)),
      ]);
    return { initiatives, epics, placements, tickets, activity };
  }
}
