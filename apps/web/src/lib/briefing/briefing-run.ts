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

/** The run a card follows. `/events` carries everyone's runs, so an unknown run is only followed once `GET /briefings` reports it as this person's. */
export class BriefingRun {
  static idle(): BriefingRunState {
    return { phase: 'idle' };
  }

  static requested(runId: string): BriefingRunState {
    return { phase: 'requested', runId };
  }

  /** Whatever Mission Control says is running replaces what the card believed, except a run the card already saw end. */
  static reconcile(
    running: BriefingRunning | null,
    context: { current?: BriefingRunState; ended?: ReadonlySet<string> } = {},
  ): BriefingRunState {
    const { current, ended } = context;
    if (running === null || ended?.has(running.runId) === true) {
      return BriefingRun.idle();
    }
    if (current !== undefined && current.phase !== 'idle') {
      if (current.runId === running.runId) return current;
    }
    return BriefingRun.requested(running.runId);
  }

  /** A stage that arrived before the re-read confirmed the run, applied once the card follows it without a stage. */
  static confirm(props: {
    state: BriefingRunState;
    event: BriefingRunEvent;
  }): BriefingRunState {
    const { state, event } = props;
    if (event.kind !== 'progress' || state.phase !== 'requested') return state;
    if (state.runId !== event.runId) return state;
    return { phase: 'running', runId: event.runId, stage: event.stage };
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
    if (state.phase === 'idle') return { state, refetch: true, finished: null };
    if (state.runId !== event.runId) {
      return { state, refetch: false, finished: null };
    }

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
