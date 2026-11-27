import type { Epic, Initiative, Ticket } from '#src/contracts/work-item.ts';

/** Reads initiatives, epics and tickets from a tracker. Read-only: Dash never writes back. */
export interface TaskTracker {
  listInitiatives(): Promise<readonly Initiative[]>;
  listEpics(query: { initiativeId: string }): Promise<readonly Epic[]>;
  listTickets(query: { epicId: string }): Promise<readonly Ticket[]>;
}
