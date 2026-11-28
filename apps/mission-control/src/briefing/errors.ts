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

/** Fastify answers with `statusCode` and `code`. */
export class BriefingSignInRequiredError extends Error {
  override name = 'BriefingSignInRequiredError';
  readonly statusCode = 401;
  readonly code = 'SIGN_IN_REQUIRED';

  constructor() {
    super('Sign in to Dash as a person to read your briefings.');
  }
}

export class BriefingNotSavedError extends Error {
  override name = 'BriefingNotSavedError';

  constructor() {
    super('Postgres returned no briefing row from the insert');
  }
}

export class BriefingNotRegisteredError extends Error {
  override name = 'BriefingNotRegisteredError';

  constructor() {
    super('Register the briefing retention workflow before activating it');
  }
}
