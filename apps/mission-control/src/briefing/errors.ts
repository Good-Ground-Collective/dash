import type { BriefingTokens } from '#src/briefing/contracts/briefing-written.ts';

export type BriefingWriteFailureReason =
  'ceiling' | 'refused' | 'unreadable' | 'incomplete' | 'provider';

const reasonMessages = {
  ceiling: 'The model used up the output token ceiling before it finished.',
  refused: 'The model declined to write the briefing.',
  unreadable: 'The model’s answer was not a usable briefing.',
  incomplete: 'The model stopped before it finished the briefing.',
  provider: 'The model provider could not be reached or rejected the request.',
} satisfies Record<BriefingWriteFailureReason, string>;

/** The briefing run failed. Whatever the provider had already billed is carried so the run is recorded with its spend. */
export class BriefingWriteFailedError extends Error {
  override name = 'BriefingWriteFailedError';
  readonly reason: BriefingWriteFailureReason;
  readonly model: string | null;
  readonly tokens: BriefingTokens;
  readonly costMicroUsd: number;

  constructor(props: {
    reason: BriefingWriteFailureReason;
    model: string | null;
    tokens: BriefingTokens;
    costMicroUsd: number;
    cause?: unknown;
  }) {
    super(reasonMessages[props.reason], { cause: props.cause });
    this.reason = props.reason;
    this.model = props.model;
    this.tokens = props.tokens;
    this.costMicroUsd = props.costMicroUsd;
  }
}
