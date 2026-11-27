import type {
  TrackerQuery,
  TrackerSnapshot,
} from '#src/contracts/task-tracker-records.ts';

/** Reads initiatives, their epics and the epics' tickets through one installation of the provider's app. Read-only: Dash never writes back. */
export interface TaskTracker {
  read(query: TrackerQuery): Promise<TrackerSnapshot>;
}
