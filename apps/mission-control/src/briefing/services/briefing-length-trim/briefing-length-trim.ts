import type {
  BriefingLinkedText,
  BriefingParagraph,
} from '#src/briefing/contracts/briefing-written.ts';
import { briefingLimits } from '#src/briefing/definitions/briefing-limits/briefing-limits.ts';
import { BriefingSentences } from '#src/briefing/services/briefing-sentences/briefing-sentences.ts';

/** Cuts an over-long draft back to the briefing's shape: the first three actions, one sentence each, and at most three sentences in the opening and the closing. A draft that is too short is left for the schema to reject. */
export class BriefingLengthTrim {
  static of(text: BriefingLinkedText): BriefingLinkedText {
    return {
      ...text,
      opening: BriefingLengthTrim.paragraph(
        text.opening,
        briefingLimits.framingSentences.max,
      ),
      actions: text.actions
        .slice(0, briefingLimits.maxActions)
        .map((action) =>
          BriefingLengthTrim.paragraph(
            action,
            briefingLimits.actionSentences.max,
          ),
        ),
      closing: BriefingLengthTrim.paragraph(
        text.closing,
        briefingLimits.framingSentences.max,
      ),
    };
  }

  private static paragraph(
    paragraph: BriefingParagraph,
    limit: number,
  ): BriefingParagraph {
    return {
      segments: BriefingSentences.trim({ segments: paragraph.segments, limit }),
    };
  }
}
