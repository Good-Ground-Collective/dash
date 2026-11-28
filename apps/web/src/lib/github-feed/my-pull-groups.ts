import type { GithubFeedPullRequest } from '#lib/api/github-feed-contracts.ts';

/** The My PRs groups, in the order the tab shows them. */
export const myPullGroupKeys = [
  'changesRequested',
  'checksFailing',
  'readyToMerge',
  'waitingOnReview',
] as const;

export type MyPullGroupKey = (typeof myPullGroupKeys)[number];

/** Each group's pull requests. */
export interface MyPullGroupSplit {
  changesRequested: GithubFeedPullRequest[];
  checksFailing: GithubFeedPullRequest[];
  readyToMerge: GithubFeedPullRequest[];
  waitingOnReview: GithubFeedPullRequest[];
}

/** Sorts your own pull requests by what each needs next. */
export class MyPullGroups {
  /** The first group a pull request fits: changes requested, then failing checks, then clean to merge, else waiting. */
  static groupOf(pull: GithubFeedPullRequest): MyPullGroupKey {
    if (pull.reviewDecision === 'changes_requested') return 'changesRequested';
    if (pull.checks?.state === 'failure') return 'checksFailing';
    if (!pull.draft && pull.mergeState === 'clean') return 'readyToMerge';
    return 'waitingOnReview';
  }

  /** Every group, each keeping the order given, except that drafts go last. */
  static split(pulls: readonly GithubFeedPullRequest[]): MyPullGroupSplit {
    const ordered = pulls.toSorted((a, b) => Number(a.draft) - Number(b.draft));
    const only = (key: MyPullGroupKey): GithubFeedPullRequest[] =>
      ordered.filter((pull) => MyPullGroups.groupOf(pull) === key);
    return {
      changesRequested: only('changesRequested'),
      checksFailing: only('checksFailing'),
      readyToMerge: only('readyToMerge'),
      waitingOnReview: only('waitingOnReview'),
    };
  }
}
