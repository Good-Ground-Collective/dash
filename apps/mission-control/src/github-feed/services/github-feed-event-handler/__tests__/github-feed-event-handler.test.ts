import { describe, expect, it } from 'vitest';

import { GithubFeedHarness } from '#src/github-feed/__tests__/support/github-feed-harness.ts';

const { webhookEvents } = new GithubFeedHarness();

class Events {
  static handled(event: string, action: string | null) {
    return (
      webhookEvents.handlersFor({ provider: 'github', event, action }).length >
      0
    );
  }
}

describe('GithubFeedModule webhook events', () => {
  it.each([
    ['pull_request', 'opened'],
    ['pull_request', 'review_requested'],
    ['pull_request', 'synchronize'],
    ['pull_request_review', 'submitted'],
    ['check_suite', 'completed'],
    ['check_run', 'created'],
    ['status', null],
    ['workflow_run', 'completed'],
    ['issues', 'assigned'],
    ['issues', 'unassigned'],
    ['issues', 'closed'],
    ['issues', 'reopened'],
    ['issues', 'edited'],
    ['installation', 'suspend'],
    ['installation', 'unsuspend'],
    ['installation_repositories', 'added'],
    ['installation_repositories', 'removed'],
  ])('reads the connection again on %s %s', (event, action) => {
    expect(Events.handled(event, action)).toBe(true);
  });

  it.each([
    ['pull_request', 'labeled'],
    ['issues', 'opened'],
    ['issues', 'labeled'],
    ['installation', 'created'],
    ['installation', 'deleted'],
    ['projects_v2_item', 'edited'],
    ['sub_issues', 'sub_issue_added'],
    ['star', 'created'],
    ['push', null],
  ])('leaves %s %s alone', (event, action) => {
    expect(Events.handled(event, action)).toBe(false);
  });
});
