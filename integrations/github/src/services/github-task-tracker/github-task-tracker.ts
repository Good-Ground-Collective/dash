import type {
  Epic,
  Initiative,
  TaskTracker,
  Ticket,
} from '@dash/integrations-core';

/** Reads Projects as initiatives, `epic`-labelled issues as epics and their sub-issues as tickets. A stub that reads nothing yet. */
export class GithubTaskTracker implements TaskTracker {
  async listInitiatives(): Promise<readonly Initiative[]> {
    return [];
  }

  async listEpics(): Promise<readonly Epic[]> {
    return [];
  }

  async listTickets(): Promise<readonly Ticket[]> {
    return [];
  }
}
