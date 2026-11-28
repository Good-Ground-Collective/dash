import type { BriefingDraft } from '#src/briefing/contracts/briefing-draft.ts';
import type {
  BriefingCounts,
  BriefingPullRequestDraft,
  BriefingSnapshotDigest,
} from '#src/briefing/contracts/briefing-snapshot.ts';
import { briefingLimits } from '#src/briefing/definitions/briefing-limits/briefing-limits.ts';
import { BriefingRefs } from '#src/briefing/services/briefing-refs/briefing-refs.ts';

type Drop = (draft: BriefingDraft) => boolean;

/**
 * Brings a draft inside the character budget by dropping the least important items first,
 * one at a time from the tail of their section, until the serialized digest fits: assigned
 * issues, then my pull requests without a problem, then epics beyond the first two under
 * each initiative, then agents. Past those, benches, the rest of my pull requests, review
 * requests, failed runs, epics and last initiatives go, in that order. Connection health
 * stays, so the writer can always say when data is stale. Refs are assigned after each
 * drop, so the ones left run without gaps.
 */
export class BriefingFit {
  static digest(props: {
    draft: BriefingDraft;
    takenAt: string;
    counts: BriefingCounts;
  }): BriefingSnapshotDigest {
    const draft = structuredClone(props.draft);
    const build = () =>
      BriefingRefs.assign({
        draft,
        takenAt: props.takenAt,
        counts: props.counts,
      });

    let digest = build();
    for (const drop of BriefingFit.drops()) {
      while (BriefingFit.size(digest) > briefingLimits.budgetCharacters) {
        if (!drop(draft)) {
          break;
        }
        digest = build();
      }
    }
    return digest;
  }

  private static size(digest: BriefingSnapshotDigest): number {
    return JSON.stringify(digest).length;
  }

  private static drops(): Drop[] {
    return [
      (draft) => draft.assignedIssues.pop() !== undefined,
      (draft) => BriefingFit.dropPullRequest({ draft, onlyQuiet: true }),
      (draft) =>
        BriefingFit.dropEpic({
          draft,
          keep: briefingLimits.epicsKeptUnderPressure,
        }),
      (draft) => draft.agents.pop() !== undefined,
      (draft) => draft.benches.pop() !== undefined,
      (draft) => BriefingFit.dropPullRequest({ draft, onlyQuiet: false }),
      (draft) => draft.reviewRequests.pop() !== undefined,
      (draft) => draft.failedRuns.pop() !== undefined,
      (draft) => BriefingFit.dropEpic({ draft, keep: 0 }),
      (draft) => draft.initiatives.pop() !== undefined,
    ];
  }

  private static dropPullRequest(props: {
    draft: BriefingDraft;
    onlyQuiet: boolean;
  }): boolean {
    const { myPullRequests } = props.draft;
    const index = myPullRequests.findLastIndex(
      (pullRequest) => !props.onlyQuiet || !BriefingFit.hasProblem(pullRequest),
    );
    if (index === -1) {
      return false;
    }
    myPullRequests.splice(index, 1);
    return true;
  }

  private static dropEpic(props: {
    draft: BriefingDraft;
    keep: number;
  }): boolean {
    const crowded = props.draft.initiatives.findLast(
      ({ epics }) => epics.length > props.keep,
    );
    return crowded?.epics.pop() !== undefined;
  }

  private static hasProblem(pullRequest: BriefingPullRequestDraft): boolean {
    return (
      pullRequest.reviewDecision === 'changes_requested' ||
      pullRequest.mergeable === 'conflicting' ||
      pullRequest.checks?.state === 'failure'
    );
  }
}
