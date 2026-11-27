import type { Epic, Initiative, Ticket } from '#src/contracts/work-item.ts';

/** Reads initiatives, epics and tickets from a tracker. Read-only: Dash never writes back. */
export interface TaskTracker {
  listInitiatives(): Promise<readonly Initiative[]>;
  /** Without `initiativeId`, every epic the connection can see, including epics outside any initiative. */
  listEpics(query?: { initiativeId?: string }): Promise<readonly Epic[]>;
  /** Without `epicId`, every ticket the connection can see, including tickets outside any epic. */
  listTickets(query?: { epicId?: string }): Promise<readonly Ticket[]>;
}
