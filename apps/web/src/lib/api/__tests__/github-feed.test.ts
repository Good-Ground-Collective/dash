import { describe, expect, it } from 'vitest';
import { HttpGithubFeed } from '#lib/api/github-feed.ts';
import { MissionControlError } from '#lib/api/mission-control-error.ts';

class RecordingFetch {
  readonly calls: { url: string; init: RequestInit | undefined }[] = [];
  private readonly response: () => Response;

  constructor(props: { response: () => Response }) {
    this.response = props.response;
  }

  readonly fetch: typeof fetch = async (input, init) => {
    this.calls.push({ url: String(input), init });
    return this.response();
  };
}

const wire = {
  connections: [
    {
      id: '5b0e4d1c-0000-4000-8000-000000000001',
      accountLogin: 'acme',
      kind: 'owned',
      lastSyncedAt: '2026-11-27T11:55:00.000Z',
      lastError: null,
      truncated: false,
    },
  ],
  reviewRequests: [],
  myPullRequests: [
    {
      id: 'PR_1',
      connectionId: '5b0e4d1c-0000-4000-8000-000000000001',
      repository: { fullName: 'acme/web', url: 'https://github.com/acme/web' },
      url: 'https://github.com/acme/web/pull/1',
      updatedAt: '2026-11-27T08:00:00.000Z',
      mergedAt: null,
      createdAt: '2026-11-20T08:00:00.000Z',
      number: 1,
      title: 'Add dark mode',
      author: 'ada',
      state: 'open',
      draft: false,
      mergeable: 'mergeable',
      mergeState: null,
      reviewDecision: null,
      headSha: 'a1b2c3d',
      requestedReviewers: [],
      checks: null,
    },
  ],
  recentMerges: [],
  releases: [],
  failedRuns: [],
  defaultBranches: [
    {
      repository: { fullName: 'acme/web', url: 'https://github.com/acme/web' },
      branch: 'main',
      headSha: 'c0ffee',
      state: 'failure',
      checksTruncated: false,
      checks: [
        {
          name: 'build',
          kind: 'check_run',
          app: 'github-actions',
          state: 'failure',
          url: 'https://github.com/acme/web/actions/runs/9',
          failingSince: '2026-11-24T08:00:00.000Z',
        },
      ],
    },
  ],
  assignedIssues: [
    {
      id: 'I_1',
      connectionId: '5b0e4d1c-0000-4000-8000-000000000001',
      repository: { fullName: 'acme/web', url: 'https://github.com/acme/web' },
      url: 'https://github.com/acme/web/issues/7',
      updatedAt: '2026-11-27T08:00:00.000Z',
      number: 7,
      title: 'Dark mode flickers',
      author: null,
      assignees: ['ada'],
    },
  ],
};

describe('HttpGithubFeed', () => {
  it('reads the feed with credentials and turns timestamps into dates', async () => {
    const recording = new RecordingFetch({
      response: () => Response.json(wire),
    });
    const feed = new HttpGithubFeed({
      baseUrl: 'https://api.example.test/mc',
      fetch: recording.fetch,
    });

    const answer = await feed.get();

    expect(recording.calls[0]?.url).toBe(
      'https://api.example.test/mc/integrations/github/feed',
    );
    expect(recording.calls[0]?.init?.credentials).toBe('include');
    expect(answer.connections[0]?.lastSyncedAt).toEqual(
      new Date('2026-11-27T11:55:00Z'),
    );
    expect(answer.assignedIssues[0]?.updatedAt).toBeInstanceOf(Date);
    expect(answer.defaultBranches[0]?.checks[0]?.failingSince).toEqual(
      new Date('2026-11-24T08:00:00Z'),
    );
    expect(answer.myPullRequests[0]?.createdAt).toEqual(
      new Date('2026-11-20T08:00:00Z'),
    );
    expect(answer.myPullRequests[0]?.mergeState).toBeNull();
  });

  it('rejects with Mission Control’s code when signed out', async () => {
    const feed = new HttpGithubFeed({
      baseUrl: 'https://api.example.test',
      fetch: new RecordingFetch({
        response: () =>
          Response.json({ code: 'SIGN_IN_REQUIRED' }, { status: 401 }),
      }).fetch,
    });

    await expect(feed.get()).rejects.toMatchObject({
      name: 'MissionControlError',
      code: 'SIGN_IN_REQUIRED',
    });
    await expect(feed.get()).rejects.toBeInstanceOf(MissionControlError);
  });

  it('rejects a row whose link isn’t http(s)', async () => {
    const bad = structuredClone(wire);
    const issue = bad.assignedIssues[0];
    if (issue !== undefined) issue.url = 'javascript:alert(1)';
    const feed = new HttpGithubFeed({
      baseUrl: 'https://api.example.test',
      fetch: new RecordingFetch({ response: () => Response.json(bad) }).fetch,
    });

    await expect(feed.get()).rejects.toMatchObject({
      issues: [expect.objectContaining({ path: ['assignedIssues', 0, 'url'] })],
    });
  });
});
