type CheckState = 'success' | 'failure' | 'pending';

/** A default branch as `GithubFeedStub` serves it before the person's watched checks are applied. */
export interface StubBranch {
  repository: { fullName: string; url: string };
  branch: string;
  headSha: string;
  state: CheckState;
  checksTruncated: boolean;
  checks: StubCheck[];
}

export interface StubCheck {
  name: string;
  kind: 'check_run' | 'status';
  app: string | null;
  state: CheckState;
  url: string | null;
  failingSince: string | null;
}

/** The populated feed's default branches for `GithubFeedStub`, with the checks a person would pick between. */
export class GithubFeedBranches {
  static all(): StubBranch[] {
    return [
      GithubFeedBranches.branch({
        fullName: 'acme-labs/api',
        sha: 'c0ffee1',
        checks: [
          GithubFeedBranches.run('build', 'success'),
          GithubFeedBranches.run('Deploy to Staging', 'success'),
          GithubFeedBranches.status('codecov/patch', 'success'),
        ],
      }),
      GithubFeedBranches.branch({
        fullName: 'acme-labs/web',
        sha: 'c0ffee2',
        checks: [
          GithubFeedBranches.run('build', 'failure'),
          GithubFeedBranches.run('Deploy to Staging', 'failure'),
          GithubFeedBranches.run('Lighthouse CI', 'failure'),
          GithubFeedBranches.status('codecov/patch', 'success'),
        ],
      }),
      GithubFeedBranches.branch({
        fullName: 'night-shift/ops',
        sha: 'c0ffee3',
        checks: [
          GithubFeedBranches.run('Deploy to Staging', 'pending'),
          GithubFeedBranches.run('lint', 'success'),
        ],
      }),
    ];
  }

  /** `count` more repositories across four accounts, a few of them failing, for a table that has to hold over a hundred. */
  static many(count: number): StubBranch[] {
    return [
      ...GithubFeedBranches.all(),
      ...Array.from({ length: count }, (_, index) =>
        GithubFeedBranches.branch({
          fullName: `owner-${String(index % 4)}/repo-${String(index).padStart(3, '0')}`,
          sha: `bead${String(index).padStart(3, '0')}`,
          checks: [
            GithubFeedBranches.run('build', 'success'),
            GithubFeedBranches.run(
              'Deploy to Staging',
              index % 9 === 0 ? 'failure' : 'success',
            ),
          ],
        }),
      ),
    ];
  }

  private static branch(props: {
    fullName: string;
    sha: string;
    checks: StubCheck[];
  }): StubBranch {
    const states = props.checks.map(({ state }) => state);
    let state: CheckState = 'success';
    if (states.includes('failure')) {
      state = 'failure';
    } else if (states.includes('pending')) {
      state = 'pending';
    }
    return {
      repository: {
        fullName: props.fullName,
        url: `https://github.com/${props.fullName}`,
      },
      branch: 'main',
      headSha: props.sha,
      state,
      checksTruncated: false,
      checks: props.checks,
    };
  }

  private static run(name: string, state: CheckState): StubCheck {
    return {
      name,
      kind: 'check_run',
      app: 'github-actions',
      state,
      url: null,
      failingSince:
        state === 'failure'
          ? new Date(Date.now() - 72 * 60 * 60 * 1000).toISOString()
          : null,
    };
  }

  private static status(name: string, state: CheckState): StubCheck {
    return {
      name,
      kind: 'status',
      app: null,
      state,
      url: null,
      failingSince: null,
    };
  }
}
