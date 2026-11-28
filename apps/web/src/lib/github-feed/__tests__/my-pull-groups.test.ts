import { describe, expect, it } from 'vitest';
import { MyPullGroups } from '#lib/github-feed/my-pull-groups.ts';
import { SampleFeed } from './support/sample-feed.ts';

const failing = {
  state: 'failure',
  success: 0,
  failure: 2,
  pending: 0,
} as const;

describe('MyPullGroups.groupOf', () => {
  it('puts changes requested before failing checks', () => {
    const pull = SampleFeed.pull({
      reviewDecision: 'changes_requested',
      checks: failing,
    });

    expect(MyPullGroups.groupOf(pull)).toBe('changesRequested');
  });

  it('puts failing checks before a clean merge state', () => {
    const pull = SampleFeed.pull({ mergeState: 'clean', checks: failing });

    expect(MyPullGroups.groupOf(pull)).toBe('checksFailing');
  });

  it('is ready to merge only when clean and not a draft', () => {
    const clean = SampleFeed.pull({ mergeState: 'clean' });
    const draft = SampleFeed.pull({ mergeState: 'clean', draft: true });

    expect(MyPullGroups.groupOf(clean)).toBe('readyToMerge');
    expect(MyPullGroups.groupOf(draft)).toBe('waitingOnReview');
  });

  it('waits on review for anything else, including an unread merge state', () => {
    for (const mergeState of ['blocked', 'behind', 'dirty', null] as const) {
      expect(MyPullGroups.groupOf(SampleFeed.pull({ mergeState }))).toBe(
        'waitingOnReview',
      );
    }
  });
});

describe('MyPullGroups.split', () => {
  it('keeps the given order within a group, with drafts last', () => {
    const groups = MyPullGroups.split([
      SampleFeed.pull({ id: 'draft', draft: true, mergeState: 'draft' }),
      SampleFeed.pull({ id: 'waiting', mergeState: 'blocked' }),
      SampleFeed.pull({ id: 'ready' }),
      SampleFeed.pull({ id: 'failing', checks: failing }),
      SampleFeed.pull({ id: 'changes', reviewDecision: 'changes_requested' }),
    ]);

    const ids = (pulls: { id: string }[]): string[] =>
      pulls.map((pull) => pull.id);

    expect({
      changesRequested: ids(groups.changesRequested),
      checksFailing: ids(groups.checksFailing),
      readyToMerge: ids(groups.readyToMerge),
      waitingOnReview: ids(groups.waitingOnReview),
    }).toEqual({
      changesRequested: ['changes'],
      checksFailing: ['failing'],
      readyToMerge: ['ready'],
      waitingOnReview: ['waiting', 'draft'],
    });
  });
});
