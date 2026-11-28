import OpenAI from 'openai';

import type { BriefingSnapshotDigest } from '#src/briefing/contracts/briefing-snapshot.ts';
import type { BriefingWriteOutcome } from '#src/briefing/contracts/briefing-write-outcome.ts';
import { BriefingWriteFailedError } from '#src/briefing/errors.ts';
import type { BriefingWriter } from '#src/briefing/services/briefing-writer/briefing-writer.ts';

/** One try at writing the briefing, settled the way a durable step needs: an outcome to keep, or an error worth trying again. */
export class BriefingWriteAttempt {
  /** A failed write comes back as an outcome. Only a rate limit or a lost connection is thrown, so the step runs once more. */
  static async of(props: {
    writer: BriefingWriter;
    snapshot: BriefingSnapshotDigest;
  }): Promise<BriefingWriteOutcome> {
    try {
      return {
        status: 'written',
        written: await props.writer.write(props.snapshot),
      };
    } catch (error) {
      if (
        !(error instanceof BriefingWriteFailedError) ||
        BriefingWriteAttempt.worthRetrying(error)
      ) {
        throw error;
      }
      return BriefingWriteAttempt.failed(error);
    }
  }

  static failed(error: BriefingWriteFailedError): BriefingWriteOutcome {
    return {
      status: 'failed',
      failure: {
        message: error.message,
        model: error.model,
        tokens: error.tokens,
        costMicroUsd: error.costMicroUsd,
      },
    };
  }

  private static worthRetrying(error: BriefingWriteFailedError): boolean {
    return (
      error.reason === 'provider' &&
      (error.cause instanceof OpenAI.APIConnectionError ||
        error.cause instanceof OpenAI.RateLimitError)
    );
  }
}
