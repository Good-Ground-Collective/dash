import type {
  Activity,
  ActivityQuery,
} from '#src/contracts/activity-feed-records.ts';

/** Reads a person's open work through one installation of the provider's app, with the app's own credentials. */
export interface ActivityFeed {
  read(query: ActivityQuery): Promise<Activity>;
}
