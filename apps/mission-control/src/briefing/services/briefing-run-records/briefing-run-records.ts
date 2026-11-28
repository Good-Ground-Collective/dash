import type { BriefingSnapshotDigest } from '#src/briefing/contracts/briefing-snapshot.ts';
import type { BriefingWriteOutcome } from '#src/briefing/contracts/briefing-write-outcome.ts';
import type {
  BriefingParagraph,
  BriefingPrices,
} from '#src/briefing/contracts/briefing-written.ts';
import type {
  BriefingParagraph as BriefingRecordedParagraph,
  BriefingRun,
} from '#src/briefing/contracts/briefings.ts';
import type { NewBriefingRun } from '#src/briefing/repositories/briefings/briefing-repository.ts';

export type UnfinishedBriefingRun = Omit<NewBriefingRun, 'finishedAt'>;

interface RunWhoseProps {
  userId: string;
  trigger: BriefingRun['trigger'];
  startedAt: Date;
}

/** The run to keep for each way a briefing run can end, before it is stamped finished. */
export class BriefingRunRecords {
  static skippedOverBudget(props: RunWhoseProps): UnfinishedBriefingRun {
    return {
      ...props,
      status: 'skipped_over_budget',
      snapshotAt: null,
      model: null,
      tokens: { input: 0, cachedInput: 0, output: 0, reasoning: 0 },
      costMicroUsd: 0,
      prices: null,
      sourceCounts: null,
      sections: null,
      paragraphs: null,
      unknownRefs: 0,
      error:
        'The monthly briefing budget is reached, so no briefing was written.',
    };
  }

  /** A failed run keeps the spend the writer reported and is charged at the configured prices. */
  static written(
    props: RunWhoseProps & {
      snapshot: BriefingSnapshotDigest;
      outcome: BriefingWriteOutcome;
      prices: BriefingPrices;
    },
  ): UnfinishedBriefingRun {
    const { snapshot, outcome } = props;
    const base = {
      userId: props.userId,
      trigger: props.trigger,
      startedAt: props.startedAt,
      snapshotAt: new Date(snapshot.takenAt),
      sourceCounts: snapshot.counts,
    };

    if (outcome.status === 'failed') {
      return {
        ...base,
        status: 'failed',
        model: outcome.failure.model,
        tokens: outcome.failure.tokens,
        costMicroUsd: outcome.failure.costMicroUsd,
        prices: props.prices,
        sections: null,
        paragraphs: null,
        unknownRefs: 0,
        error: outcome.failure.message,
      };
    }
    const { written } = outcome;
    return {
      ...base,
      status: 'succeeded',
      model: written.model,
      tokens: written.tokens,
      costMicroUsd: written.costMicroUsd,
      prices: written.prices,
      sections: {
        opening: BriefingRunRecords.paragraph(written.opening),
        actions: written.actions.map(BriefingRunRecords.paragraph),
        closing: BriefingRunRecords.paragraph(written.closing),
      },
      paragraphs: null,
      unknownRefs: written.unknownRefs,
      error: null,
    };
  }

  private static paragraph(
    paragraph: BriefingParagraph,
  ): BriefingRecordedParagraph {
    return paragraph.segments.map(({ text, url }) => ({ text, href: url }));
  }
}
