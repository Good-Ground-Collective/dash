import type {
  BriefingProgressEvent,
  BriefingReadyEvent,
  BriefingRunning,
  BriefingStage,
  BriefingStatus,
} from '#lib/api/briefings/briefing-contracts.ts';

/** Where the person's briefing run is: none, accepted but not yet reporting, or at a stage. */
export type BriefingRunState =
  | { phase: 'idle' }
  | { phase: 'requested'; runId: string }
  | { phase: 'running'; runId: string; stage: BriefingStage };

/** A live event about a briefing run, as the card receives it. */
export type BriefingRunEvent =
  | ({ kind: 'progress' } & BriefingProgressEvent)
  | ({ kind: 'ready' } & BriefingReadyEvent);

/** The next state, whether the card should re-read the briefing, and how the run ended when this event ended it. */
export interface BriefingRunStep {
  state: BriefingRunState;
  refetch: boolean;
  finished: BriefingStatus | null;
}

/** The run a card follows. A run seen while idle is adopted, since a scheduled run or another tab may have started it. */
export class BriefingRun {
  static idle(): BriefingRunState {
    return { phase: 'idle' };
  }

  static requested(runId: string): BriefingRunState {
    return { phase: 'requested', runId };
  }

  /** Whatever Mission Control says is running replaces what the card believed. */
  static reconcile(running: BriefingRunning | null): BriefingRunState {
    return running === null
      ? BriefingRun.idle()
      : BriefingRun.requested(running.runId);
  }

  /** Whether a run is under way, which keeps the button from starting another. */
  static busy(state: BriefingRunState): boolean {
    return state.phase !== 'idle';
  }

  static receive(props: {
    state: BriefingRunState;
    event: BriefingRunEvent;
  }): BriefingRunStep {
    const { state, event } = props;
    const ours = state.phase === 'idle' || state.runId === event.runId;
    if (!ours) return { state, refetch: false, finished: null };

    if (event.kind === 'progress') {
      return {
        state: { phase: 'running', runId: event.runId, stage: event.stage },
        refetch: false,
        finished: null,
      };
    }
    return {
      state: BriefingRun.idle(),
      refetch: true,
      finished: event.status,
    };
  }
}
