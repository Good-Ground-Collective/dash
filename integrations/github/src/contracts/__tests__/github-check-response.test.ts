import { describe, expect, it } from 'vitest';

import { ActivityNodes } from '#src/__tests__/support/activity-nodes.ts';
import { githubCheckContextSchema } from '#src/contracts/github-check-response.ts';

const { checkRunNode, statusContextNode } = ActivityNodes;

describe('githubCheckContextSchema check runs', () => {
  it.each([
    { status: 'COMPLETED', conclusion: 'SUCCESS', state: 'success' },
    { status: 'COMPLETED', conclusion: 'NEUTRAL', state: 'neutral' },
    { status: 'COMPLETED', conclusion: 'STALE', state: 'neutral' },
    { status: 'COMPLETED', conclusion: 'SKIPPED', state: 'skipped' },
    { status: 'COMPLETED', conclusion: 'FAILURE', state: 'failure' },
    { status: 'COMPLETED', conclusion: 'TIMED_OUT', state: 'failure' },
    { status: 'COMPLETED', conclusion: 'CANCELLED', state: 'failure' },
    { status: 'COMPLETED', conclusion: 'ACTION_REQUIRED', state: 'failure' },
    { status: 'COMPLETED', conclusion: 'STARTUP_FAILURE', state: 'failure' },
    { status: 'QUEUED', conclusion: null, state: 'pending' },
    { status: 'IN_PROGRESS', conclusion: null, state: 'pending' },
    { status: 'WAITING', conclusion: null, state: 'pending' },
  ])('reads $status $conclusion as $state', ({ status, conclusion, state }) => {
    const read = githubCheckContextSchema.parse(
      checkRunNode({ name: 'build', status, conclusion }),
    );

    expect(read.state).toBe(state);
  });

  it('names the app, and the workflow run and job only for an Actions run', () => {
    const actions = githubCheckContextSchema.parse(
      checkRunNode({ name: 'build', workflowRunId: 77, jobId: 9001 }),
    );
    const other = githubCheckContextSchema.parse(
      checkRunNode({ name: 'vercel', app: 'vercel', jobId: 5 }),
    );

    expect(actions).toMatchObject({
      kind: 'check_run',
      app: 'github-actions',
      workflowRunId: 77,
      jobId: 9001,
    });
    expect(other).toMatchObject({
      app: 'vercel',
      workflowRunId: null,
      jobId: null,
    });
  });
});

describe('githubCheckContextSchema commit statuses', () => {
  it.each([
    { state: 'SUCCESS', expected: 'success' },
    { state: 'FAILURE', expected: 'failure' },
    { state: 'ERROR', expected: 'failure' },
    { state: 'PENDING', expected: 'pending' },
    { state: 'EXPECTED', expected: 'pending' },
  ])('reads $state as $expected', ({ state, expected }) => {
    const read = githubCheckContextSchema.parse(
      statusContextNode({ context: 'codecov/patch', state }),
    );

    expect(read).toMatchObject({
      name: 'codecov/patch',
      kind: 'status',
      app: null,
      state: expected,
    });
  });

  it('drops a link GitHub gives that is not a URL', () => {
    const read = githubCheckContextSchema.parse(
      statusContextNode({ context: 'legacy', targetUrl: 'not a url' }),
    );

    expect(read.url).toBeNull();
  });

  it.each([
    'javascript:alert(1)',
    'myapp://open/check',
    'ftp://example.com/log',
    'mailto:ci@example.com',
  ])('drops a check run link that is not http(s): %s', (detailsUrl) => {
    const read = githubCheckContextSchema.parse(
      checkRunNode({ name: 'build', detailsUrl }),
    );

    expect(read.url).toBeNull();
  });

  it.each(['javascript:alert(1)', 'myapp://open/check'])(
    'drops a status link that is not http(s): %s',
    (targetUrl) => {
      const read = githubCheckContextSchema.parse(
        statusContextNode({ context: 'legacy', targetUrl }),
      );

      expect(read.url).toBeNull();
    },
  );
});
