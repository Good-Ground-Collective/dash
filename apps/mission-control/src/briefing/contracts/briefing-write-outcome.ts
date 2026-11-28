import type { BriefingWritten } from '#src/briefing/contracts/briefing-written.ts';
import type { BriefingRun } from '#src/briefing/contracts/briefings.ts';

/** What a failed write cost and why it failed, in words Dash wrote. */
export interface BriefingWriteFailure {
  message: string;
  model: string | null;
  tokens: BriefingRun['tokens'];
  costMicroUsd: number;
}

/** How one write ended. Both outcomes are recorded as a run. */
export type BriefingWriteOutcome =
  | { status: 'written'; written: BriefingWritten }
  | { status: 'failed'; failure: BriefingWriteFailure };
