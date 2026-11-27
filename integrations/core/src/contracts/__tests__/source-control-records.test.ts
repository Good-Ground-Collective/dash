import { describe, expect, it } from 'vitest';

import {
  checkRollupSchema,
  pullRequestQuerySchema,
  pullRequestSchema,
  repositorySchema,
  reviewSchema,
} from '#src/contracts/source-control-records.ts';

const record = {
  provider: 'github',
  url: 'https://github.com/acme/app/pull/7',
};

const pullRequest = {
  ...record,
  externalId: 'PR_kwDOAbc7',
  repositoryId: 'R_kgDOAbc',
  number: 7,
  title: 'Add onboarding',
  author: 'octocat',
  state: 'open',
  draft: false,
  mergeable: 'mergeable',
  reviewDecision: 'review_required',
  requestedReviewers: ['hubot'],
  headSha: 'a1b2c3d',
  updatedAt: '2026-11-20T09:30:00+01:00',
};

describe('source control records', () => {
  it('parses a repository', () => {
    expect(
      repositorySchema.parse({
        ...record,
        externalId: 'R_kgDOAbc',
        fullName: 'acme/app',
        defaultBranch: 'main',
        archived: false,
      }).fullName,
    ).toBe('acme/app');
  });

  it('parses a pull request, with or without a review decision', () => {
    expect(pullRequestSchema.parse(pullRequest).number).toBe(7);
    expect(
      pullRequestSchema.parse({ ...pullRequest, reviewDecision: null })
        .reviewDecision,
    ).toBeNull();
  });

  it.each([
    ['a non-positive number', { number: 0 }],
    ['an unknown state', { state: 'draft' }],
    ['an unknown mergeable state', { mergeable: 'clean' }],
  ])('rejects a pull request with %s', (_label, override) => {
    expect(
      pullRequestSchema.safeParse({ ...pullRequest, ...override }).success,
    ).toBe(false);
  });

  it('parses a review', () => {
    expect(
      reviewSchema.parse({
        ...record,
        externalId: 'PRR_1',
        pullRequestId: 'PR_kwDOAbc7',
        author: 'hubot',
        state: 'changes_requested',
        submittedAt: '2026-11-20T10:00:00Z',
      }).state,
    ).toBe('changes_requested');
  });

  it('parses a check rollup whose checks may lack a URL', () => {
    const rollup = checkRollupSchema.parse({
      pullRequestId: 'PR_kwDOAbc7',
      headSha: 'a1b2c3d',
      state: 'failure',
      checks: [
        { name: 'test', state: 'failure', url: 'https://ci.example/run/1' },
        { name: 'external status', state: 'success', url: null },
      ],
    });
    expect(rollup.checks).toHaveLength(2);
  });

  it('defaults a pull request query to open pull requests', () => {
    expect(pullRequestQuerySchema.parse({})).toEqual({ state: 'open' });
  });
});
