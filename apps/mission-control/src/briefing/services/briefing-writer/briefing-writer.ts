import OpenAI from 'openai';
import { zodTextFormat } from 'openai/helpers/zod';
import type { Response } from 'openai/resources/responses/responses';
import { z } from 'zod';

import {
  briefingCompositionSchema,
  briefingRawCompositionSchema,
} from '#src/briefing/contracts/briefing-composition.ts';
import type { BriefingSnapshotDigest } from '#src/briefing/contracts/briefing-snapshot.ts';
import {
  type BriefingLinkedText,
  type BriefingParagraph,
  type BriefingPrices,
  type BriefingTokens,
  type BriefingWritten,
  briefingWrittenTextSchema,
} from '#src/briefing/contracts/briefing-written.ts';
import { briefingInstructions } from '#src/briefing/definitions/briefing-instructions/briefing-instructions.ts';
import { briefingLimits } from '#src/briefing/definitions/briefing-limits/briefing-limits.ts';
import {
  BriefingWriteFailedError,
  type BriefingWriteFailureReason,
} from '#src/briefing/errors.ts';
import { BriefingCost } from '#src/briefing/services/briefing-cost/briefing-cost.ts';
import { BriefingRefLinks } from '#src/briefing/services/briefing-ref-links/briefing-ref-links.ts';
import { BriefingLengthTrim } from '#src/briefing/services/briefing-length-trim/briefing-length-trim.ts';
import { BriefingSentences } from '#src/briefing/services/briefing-sentences/briefing-sentences.ts';
import {
  type OpenAiBriefingWriterProps,
  openAiBriefingWriterPropsSchema,
} from '#src/briefing/services/briefing-writer/briefing-writer-props.ts';

const charactersPerToken = 3;

const compositionFromTextSchema = z
  .string()
  .transform((text, context) => {
    try {
      return JSON.parse(text);
    } catch {
      context.addIssue({ code: 'custom', message: 'Expected JSON text' });
      return z.NEVER;
    }
  })
  .pipe(briefingRawCompositionSchema);

export interface BriefingWriter {
  /** Writes the briefing for a snapshot. Throws `BriefingWriteFailedError`, carrying what the run cost, when no usable briefing came back. */
  write(snapshot: BriefingSnapshotDigest): Promise<BriefingWritten>;
  /** The most a run on this snapshot could cost, for checking the budget before calling the model. */
  worstCaseCostMicroUsd(snapshot: BriefingSnapshotDigest): number;
}

/** Writes the briefing with OpenAI's Responses API. Retrying belongs to the caller, so the client is built without retries. */
export class OpenAiBriefingWriter implements BriefingWriter {
  private readonly client: OpenAI;
  private readonly model: string;
  private readonly prices: BriefingPrices;
  private readonly maxOutputTokens: number;

  constructor(props: OpenAiBriefingWriterProps) {
    const { client, settings } = openAiBriefingWriterPropsSchema.parse(props);
    this.client = client;
    this.model = settings.model;
    this.prices = settings.prices;
    this.maxOutputTokens = settings.maxOutputTokens;
  }

  async write(snapshot: BriefingSnapshotDigest): Promise<BriefingWritten> {
    const response = await this.send(snapshot);
    const tokens = OpenAiBriefingWriter.tokensOf(response);
    const costMicroUsd = BriefingCost.price({ tokens, prices: this.prices });
    const fail = (reason: BriefingWriteFailureReason, cause?: unknown) =>
      new BriefingWriteFailedError({
        reason,
        model: response.model,
        tokens,
        costMicroUsd,
        cause,
      });

    const incomplete = OpenAiBriefingWriter.incompleteReason(response);
    if (incomplete !== null) throw fail(incomplete);
    if (OpenAiBriefingWriter.refusalOf(response) !== null) {
      throw fail('refused');
    }

    const parsed = compositionFromTextSchema.safeParse(
      OpenAiBriefingWriter.textOf(response),
    );
    if (!parsed.success) throw fail('unreadable', parsed.error);

    const linked = BriefingLengthTrim.of(
      BriefingRefLinks.attach({ composition: parsed.data, snapshot }),
    );
    const valid = briefingWrittenTextSchema.safeParse(linked);
    if (!valid.success) {
      throw fail(
        OpenAiBriefingWriter.isTooShort(linked) ? 'tooShort' : 'unreadable',
        valid.error,
      );
    }

    return {
      ...valid.data,
      unknownRefs: linked.unknownRefs,
      model: response.model,
      tokens,
      costMicroUsd,
      prices: this.prices,
    };
  }

  worstCaseCostMicroUsd(snapshot: BriefingSnapshotDigest): number {
    const promptCharacters =
      briefingInstructions.length +
      OpenAiBriefingWriter.promptFor(snapshot).length;
    return BriefingCost.ceiling({
      inputTokens: Math.ceil(promptCharacters / charactersPerToken),
      maxOutputTokens: this.maxOutputTokens,
      prices: this.prices,
    });
  }

  /** A timed-out request may still finish and be billed, so it is charged at the worst case. */
  private async send(snapshot: BriefingSnapshotDigest): Promise<Response> {
    try {
      return await this.client.responses.create({
        model: this.model,
        instructions: briefingInstructions,
        input: OpenAiBriefingWriter.promptFor(snapshot),
        max_output_tokens: this.maxOutputTokens,
        text: { format: zodTextFormat(briefingCompositionSchema, 'briefing') },
      });
    } catch (error) {
      if (!(error instanceof OpenAI.APIError)) throw error;
      const timedOut = error instanceof OpenAI.APIConnectionTimeoutError;
      throw new BriefingWriteFailedError({
        reason: 'provider',
        model: timedOut ? this.model : null,
        tokens: { input: 0, cachedInput: 0, output: 0, reasoning: 0 },
        costMicroUsd: timedOut ? this.worstCaseCostMicroUsd(snapshot) : 0,
        cause: error,
      });
    }
  }

  /**
   * Escapes `<` and `>` as JSON unicode escapes, so text from GitHub such as a title holding
   * `</snapshot>` can't close the data block early. The JSON still parses to the same snapshot.
   */
  static promptFor(snapshot: BriefingSnapshotDigest): string {
    const json = JSON.stringify(snapshot)
      .replaceAll('<', '\\u003c')
      .replaceAll('>', '\\u003e');
    return `<snapshot>\n${json}\n</snapshot>`;
  }

  /** The trim only shortens, so a draft the schema still rejects for its length is one with too few sentences. */
  private static isTooShort(text: BriefingLinkedText): boolean {
    const { framingSentences, actionSentences } = briefingLimits;
    const short = (paragraph: BriefingParagraph, min: number) =>
      BriefingSentences.count(paragraph.segments) < min;
    return (
      short(text.opening, framingSentences.min) ||
      short(text.closing, framingSentences.min) ||
      text.actions.some((action) => short(action, actionSentences.min))
    );
  }

  private static tokensOf(response: Response): BriefingTokens {
    const { usage } = response;
    return {
      input: usage?.input_tokens ?? 0,
      cachedInput: usage?.input_tokens_details.cached_tokens ?? 0,
      output: usage?.output_tokens ?? 0,
      reasoning: usage?.output_tokens_details.reasoning_tokens ?? 0,
    };
  }

  private static incompleteReason(
    response: Response,
  ): BriefingWriteFailureReason | null {
    if (response.status === 'incomplete') {
      return response.incomplete_details?.reason === 'max_output_tokens'
        ? 'ceiling'
        : 'incomplete';
    }
    return response.status === 'completed' ? null : 'incomplete';
  }

  private static refusalOf(response: Response): string | null {
    for (const item of response.output) {
      if (item.type !== 'message') continue;
      for (const part of item.content) {
        if (part.type === 'refusal') return part.refusal;
      }
    }
    return null;
  }

  private static textOf(response: Response): string {
    return response.output
      .flatMap((item) => (item.type === 'message' ? item.content : []))
      .flatMap((part) => (part.type === 'output_text' ? [part.text] : []))
      .join('');
  }
}
