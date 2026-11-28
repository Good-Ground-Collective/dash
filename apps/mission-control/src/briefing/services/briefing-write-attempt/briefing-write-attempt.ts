import { setTimeout as delay } from 'node:timers/promises';

import { DBOS } from '@dbos-inc/dbos-sdk';
import OpenAI from 'openai';

import type { BriefingSnapshotDigest } from '#src/briefing/contracts/briefing-snapshot.ts';
import type { BriefingTokens } from '#src/briefing/contracts/briefing-written.ts';
import type { BriefingWriteOutcome } from '#src/briefing/contracts/briefing-write-outcome.ts';
import { BriefingWriteFailedError } from '#src/briefing/errors.ts';
import type { BriefingWriter } from '#src/briefing/services/briefing-writer/briefing-writer.ts';

/** One try at writing the briefing, settled the way a durable step needs: an outcome to keep, or an error worth trying again. */
export class BriefingWriteAttempt {
  /** A failed write comes back as an outcome. Only a draft that was too short, a rate limit or a connection that never sent the request is thrown, so the step runs once more. A timeout may already be billed, so it is not retried. */
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

  /** A too-short draft is written again, so a run can pay for every attempt the step allows. */
  static worstCaseCostMicroUsd(props: {
    writer: BriefingWriter;
    snapshot: BriefingSnapshotDigest;
    attempts: number;
  }): number {
    return props.writer.worstCaseCostMicroUsd(props.snapshot) * props.attempts;
  }

  /** Runs every attempt inside one durable step, so the step's checkpoint holds the outcome with the spend of all attempts and a replay records the same cost. The step's own retries are off. */
  static async runAsStep(props: {
    writer: BriefingWriter;
    snapshot: BriefingSnapshotDigest;
    step: {
      name: string;
      maxAttempts: number;
      intervalSeconds: number;
      backoffRate: number;
    };
  }): Promise<BriefingWriteOutcome> {
    const { step, ...attempt } = props;
    return DBOS.runStep(
      () => BriefingWriteAttempt.untilSettled({ ...attempt, ...step }),
      { name: step.name, retriesAllowed: false },
    );
  }

  /** Tries up to `maxAttempts` times, waiting longer after each retried one, and folds the spend of the retried attempts into the outcome it returns. */
  static async untilSettled(props: {
    writer: BriefingWriter;
    snapshot: BriefingSnapshotDigest;
    maxAttempts: number;
    intervalSeconds: number;
    backoffRate: number;
  }): Promise<BriefingWriteOutcome> {
    const { maxAttempts, intervalSeconds, backoffRate, ...attempt } = props;
    const retried: BriefingWriteFailedError[] = [];
    for (let tried = 1; tried <= maxAttempts; tried += 1) {
      try {
        return BriefingWriteAttempt.withEarlierSpend({
          outcome: await BriefingWriteAttempt.of(attempt),
          earlier: retried,
        });
      } catch (error) {
        if (!(error instanceof BriefingWriteFailedError)) {
          throw error;
        }
        retried.push(error);
        if (tried < maxAttempts) {
          await delay(intervalSeconds * backoffRate ** (tried - 1) * 1000);
        }
      }
    }
    const last = retried.pop();
    if (last === undefined) {
      throw new Error('Expected at least one write attempt');
    }
    return BriefingWriteAttempt.withEarlierSpend({
      outcome: BriefingWriteAttempt.failed(last),
      earlier: retried,
    });
  }

  /** Adds what the attempts before the settled one had already cost, since only the last attempt's outcome is kept. */
  static withEarlierSpend(props: {
    outcome: BriefingWriteOutcome;
    earlier: BriefingWriteFailedError[];
  }): BriefingWriteOutcome {
    const { outcome, earlier } = props;
    if (earlier.length === 0) return outcome;
    const costMicroUsd = earlier.reduce((sum, e) => sum + e.costMicroUsd, 0);
    const add = (tokens: BriefingTokens): BriefingTokens => ({
      input: earlier.reduce((sum, e) => sum + e.tokens.input, tokens.input),
      cachedInput: earlier.reduce(
        (sum, e) => sum + e.tokens.cachedInput,
        tokens.cachedInput,
      ),
      output: earlier.reduce((sum, e) => sum + e.tokens.output, tokens.output),
      reasoning: earlier.reduce(
        (sum, e) => sum + e.tokens.reasoning,
        tokens.reasoning,
      ),
    });
    if (outcome.status === 'failed') {
      return {
        status: 'failed',
        failure: {
          ...outcome.failure,
          tokens: add(outcome.failure.tokens),
          costMicroUsd: outcome.failure.costMicroUsd + costMicroUsd,
        },
      };
    }
    return {
      status: 'written',
      written: {
        ...outcome.written,
        tokens: add(outcome.written.tokens),
        costMicroUsd: outcome.written.costMicroUsd + costMicroUsd,
      },
    };
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
      error.reason === 'tooShort' ||
      (error.reason === 'provider' &&
        !(error.cause instanceof OpenAI.APIConnectionTimeoutError) &&
        (error.cause instanceof OpenAI.APIConnectionError ||
          error.cause instanceof OpenAI.RateLimitError))
    );
  }
}
