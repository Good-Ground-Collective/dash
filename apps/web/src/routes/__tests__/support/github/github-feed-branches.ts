/** The populated feed's default branches for `GithubFeedStub`, one passing and one failing. */
export class GithubFeedBranches {
  static all() {
    return [
      {
        repository: {
          fullName: 'acme-labs/api',
          url: 'https://github.com/acme-labs/api',
        },
        branch: 'main',
        headSha: 'c0ffee1',
        state: 'success',
        checks: [
          {
            name: 'build',
            kind: 'check_run',
            app: 'github-actions',
            state: 'success',
            url: 'https://github.com/acme-labs/api/actions/runs/771',
            failingSince: null,
          },
        ],
      },
      {
        repository: {
          fullName: 'acme-labs/web',
          url: 'https://github.com/acme-labs/web',
        },
        branch: 'main',
        headSha: 'c0ffee2',
        state: 'failure',
        checks: [
          {
            name: 'build',
            kind: 'check_run',
            app: 'github-actions',
            state: 'failure',
            url: 'https://github.com/acme-labs/web/actions/runs/1280',
            failingSince: new Date(
              Date.now() - 72 * 60 * 60 * 1000,
            ).toISOString(),
          },
          {
            name: 'codecov/patch',
            kind: 'status',
            app: null,
            state: 'success',
            url: null,
            failingSince: null,
          },
        ],
      },
    ];
  }
}
