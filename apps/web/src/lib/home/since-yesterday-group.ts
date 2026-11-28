import type { FeedRow } from '#lib/github-feed/feed-rows.ts';
import type { ObjectiveProgressView } from '#lib/objectives/objective-rows.ts';

export type SinceYesterdayKind =
  'initiative' | 'epic' | 'more-epics' | 'releases' | 'other-merges';

/** A run of rows inside an expanded group, headed by the epic they belong to when the group holds several. */
export interface SinceYesterdaySection {
  id: string;
  title: string | null;
  /** “3 merged · 1 closed”, or `null` when the section has no title. */
  summary: string | null;
  rows: FeedRow[];
}

/** One top-level item of Since yesterday: what moved, how much, and the rows behind it. */
export interface SinceYesterdayGroup {
  /** Stable across reads, so an expanded group stays expanded. */
  id: string;
  kind: SinceYesterdayKind;
  title: string;
  /** Where the epic or initiative lives on GitHub, or `null` for a group that isn't one. */
  href: string | null;
  /** “3 merged · 1 closed”, “2 releases” or “5 merged”. */
  summary: string;
  /** Present for an initiative or epic, and `null` for the rest. */
  progress: ObjectiveProgressView | null;
  sections: SinceYesterdaySection[];
}
