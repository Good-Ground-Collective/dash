import type { BriefingDraft } from '#src/briefing/contracts/briefing-draft.ts';
import type {
  BriefingCounts,
  BriefingObjective,
  BriefingSnapshotDigest,
} from '#src/briefing/contracts/briefing-snapshot.ts';

/** Gives every item of a draft its `ref`: a per-kind prefix and its place in the draft, counting from 1. Objectives number initiatives and their epics in one run. */
export class BriefingRefs {
  static assign(props: {
    draft: BriefingDraft;
    takenAt: string;
    counts: BriefingCounts;
  }): BriefingSnapshotDigest {
    const { draft } = props;
    return {
      takenAt: props.takenAt,
      objectives: BriefingRefs.objectives(draft),
      github: {
        reviewRequests: BriefingRefs.numbered('rv', draft.reviewRequests),
        myPullRequests: BriefingRefs.numbered('pr', draft.myPullRequests),
        failedRuns: BriefingRefs.numbered('run', draft.failedRuns),
        assignedIssues: BriefingRefs.numbered('is', draft.assignedIssues),
      },
      agents: BriefingRefs.numbered('ag', draft.agents),
      benches: BriefingRefs.numbered('bn', draft.benches),
      connections: BriefingRefs.numbered('cn', draft.connections),
      counts: props.counts,
    };
  }

  private static numbered<T extends object>(
    prefix: string,
    items: readonly T[],
  ): (T & { ref: string })[] {
    return items.map((item, index) => ({
      ...item,
      ref: `${prefix}${index + 1}`,
    }));
  }

  private static objectives(draft: BriefingDraft): BriefingObjective[] {
    const objectives: BriefingObjective[] = [];
    for (const { initiative, epics } of draft.initiatives) {
      const initiativeRef = `o${objectives.length + 1}`;
      objectives.push({
        ...initiative,
        ref: initiativeRef,
        initiativeRef: null,
      });
      for (const epic of epics) {
        objectives.push({
          ...epic,
          ref: `o${objectives.length + 1}`,
          initiativeRef,
        });
      }
    }
    return objectives;
  }
}
