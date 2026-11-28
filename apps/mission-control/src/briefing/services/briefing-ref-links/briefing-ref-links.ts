import type { BriefingComposition } from '#src/briefing/contracts/briefing-composition.ts';
import type { BriefingSnapshotDigest } from '#src/briefing/contracts/briefing-snapshot.ts';
import type {
  BriefingLinkedText,
  BriefingParagraph,
} from '#src/briefing/contracts/briefing-written.ts';

/** Turns the refs a model cited into the links of the snapshot's own items. Model output never becomes a URL. */
export class BriefingRefLinks {
  static attach(props: {
    composition: BriefingComposition;
    snapshot: BriefingSnapshotDigest;
  }): BriefingLinkedText {
    const urls = BriefingRefLinks.urlsByRef(props.snapshot);
    let unknownRefs = 0;
    const paragraphs: BriefingParagraph[] = [];

    for (const paragraph of props.composition.paragraphs) {
      const segments: BriefingParagraph['segments'] = [];
      for (const { text, ref } of paragraph.segments) {
        if (ref !== null && !urls.has(ref)) unknownRefs += 1;
        if (text.trim() === '') continue;
        segments.push({
          text,
          url: ref === null ? null : (urls.get(ref) ?? null),
        });
      }
      if (segments.length > 0) paragraphs.push({ segments });
    }

    return { paragraphs, unknownRefs };
  }

  private static urlsByRef(
    snapshot: BriefingSnapshotDigest,
  ): Map<string, string | null> {
    const items: { ref: string; url?: string }[] = [
      ...snapshot.objectives,
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
