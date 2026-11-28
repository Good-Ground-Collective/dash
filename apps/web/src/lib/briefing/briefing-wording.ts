import type {
  BriefingBudget,
  BriefingCounts,
  BriefingRecord,
  BriefingStage,
  BriefingStatus,
} from '#lib/api/briefings/briefing-contracts.ts';
import type { MissionControlError } from '#lib/api/mission-control-error.ts';
import { RelativeTime } from '#lib/github-feed/relative-time.ts';

const cents = new Intl.NumberFormat('en-US', {
  style: 'currency',
  currency: 'USD',
});

const wholeOrCents = new Intl.NumberFormat('en-US', {
  style: 'currency',
  currency: 'USD',
  minimumFractionDigits: 0,
});

const sourceNames: readonly {
  key: keyof BriefingCounts;
  one: string;
  many: string;
}[] = [
  { key: 'objectives', one: 'objective', many: 'objectives' },
  { key: 'reviewRequests', one: 'review request', many: 'review requests' },
  { key: 'myPullRequests', one: 'of your PRs', many: 'of your PRs' },
  { key: 'failedRuns', one: 'failed run', many: 'failed runs' },
  { key: 'assignedIssues', one: 'assigned issue', many: 'assigned issues' },
  { key: 'agents', one: 'agent', many: 'agents' },
  { key: 'benches', one: 'bench', many: 'benches' },
];

const stageSentences = {
  snapshot: 'Reading your data…',
  writing: 'Writing the briefing…',
  saving: 'Saving the briefing…',
} satisfies Record<BriefingStage, string>;

/** The sentences the Briefing card and the Settings spend readout show for times, sources, stages, refusals and spend. */
export class BriefingWording {
  static generated(when: Date): string {
    return `Generated ${RelativeTime.since(when)}`;
  }

  static snapshot(when: Date): string {
    return `Data from ${RelativeTime.since(when)}`;
  }

  static sources(counts: BriefingCounts): string[] {
    return sourceNames
      .filter(({ key }) => counts[key] > 0)
      .map(({ key, one, many }) => {
        const count = counts[key];
        return `${count} ${count === 1 ? one : many}`;
      });
  }

  /** This month's estimated spend, cap and run count, for Settings. */
  static spendReadout(budget: BriefingBudget): string {
    const spent =
      budget.spentUsd > 0 && budget.spentUsd < 0.01
        ? 'under $0.01'
        : cents.format(budget.spentUsd);
    const runs = `${budget.runs} ${budget.runs === 1 ? 'run' : 'runs'}`;
    return `AI briefing: ${spent} of ${wholeOrCents.format(budget.capUsd)} this month · ${runs}`;
  }

  static spendEstimateNote(): string {
    return 'Dash’s own estimate from token usage and the configured prices, not the amount billed.';
  }

  static spendUnavailable(): string {
    return 'Mission Control didn’t send the briefing spend. Reload to try again.';
  }

  static requested(): string {
    return 'Starting a new briefing…';
  }

  static stage(stage: BriefingStage): string {
    return stageSentences[stage];
  }

  static finished(status: BriefingStatus): string {
    if (status === 'succeeded') return 'The new briefing is ready.';
    if (status === 'failed') return 'The briefing run failed.';
    return 'The briefing run was skipped because the budget is reached.';
  }

  /** What happened to a run that left the last good briefing in place. */
  static lastRunNote(run: BriefingRecord): string | null {
    const when = RelativeTime.since(run.finishedAt);
    if (run.status === 'failed') {
      const reason = run.error === null ? '' : ` ${run.error}`;
      return `The latest run failed ${when}, so this is the previous briefing.${reason}`;
    }
    if (run.status === 'skipped_over_budget') {
      return `The latest run was skipped ${when} because this month’s budget was reached, so this is the previous briefing.`;
    }
    return null;
  }

  static budgetReached(): string {
    return 'This month’s budget is reached, so Regenerate is off.';
  }

  static unavailable(): string {
    return 'The briefing isn’t available right now. Check that Mission Control is running.';
  }

  static notConfigured(): string {
    return 'The briefing isn’t set up yet. Ask whoever runs Dash to configure it.';
  }

  static empty(): string {
    return 'No briefing yet. Regenerate to write the first one.';
  }

  /** Why Regenerate was refused, in words for the person who pressed it. `null` is a request that never got an answer. */
  static refusal(error: MissionControlError | null): string {
    if (error?.status === 401) {
      return 'Your Dash session ended. Sign in to continue.';
    }
    if (error?.code === 'BRIEFING_NOT_CONFIGURED') {
      return BriefingWording.notConfigured();
    }
    return 'Mission Control didn’t start a briefing. Try again.';
  }
}
