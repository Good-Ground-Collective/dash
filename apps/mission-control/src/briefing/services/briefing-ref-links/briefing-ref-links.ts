import type { BriefingComposition } from '#src/briefing/contracts/briefing-composition.ts';
import type { BriefingSnapshotDigest } from '#src/briefing/contracts/briefing-snapshot.ts';
import type {
  BriefingLinkedText,
  BriefingParagraph,
} from '#src/briefing/contracts/briefing-written.ts';
import { BriefingRefTokens } from '#src/briefing/services/briefing-ref-tokens/briefing-ref-tokens.ts';

/** Turns the refs a model cited into the links of the snapshot's own items. Model output never becomes a URL, and an id left in the words is removed rather than shown. */
export class BriefingRefLinks {
  static attach(props: {
    composition: BriefingComposition;
    snapshot: BriefingSnapshotDigest;
  }): BriefingLinkedText {
    const urls = BriefingRefLinks.urlsByRef(props.snapshot);
    let unknownRefs = 0;

    const link = (paragraph: BriefingComposition['opening']) => {
      const segments: BriefingParagraph['segments'] = [];
      for (const { text, ref } of paragraph.segments) {
        if (ref !== null && !urls.has(ref)) unknownRefs += 1;
        const clean = BriefingRefTokens.strip(text);
        if (clean.trim() === '') continue;
        segments.push({
          text: clean,
          url: ref === null ? null : (urls.get(ref) ?? null),
        });
      }
      return { segments };
    };

    const { composition } = props;
    return {
      opening: link(composition.opening),
      actions: composition.actions
        .map(link)
        .filter(({ segments }) => segments.length > 0),
      closing: link(composition.closing),
      unknownRefs,
    };
  }

  private static urlsByRef(
    snapshot: BriefingSnapshotDigest,
  ): Map<string, string | null> {
    const items: { ref: string; url?: string }[] = [
      ...snapshot.objectives,
      ...snapshot.sinceLastBriefing.changes,
      ...snapshot.github.reviewRequests,
      ...snapshot.github.myPullRequests,
      ...snapshot.github.failedRuns,
      ...snapshot.github.assignedIssues,
      ...snapshot.agents,
      ...snapshot.benches,
      ...snapshot.connections,
    ];
    return new Map(items.map((item) => [item.ref, item.url ?? null]));
  }
}
