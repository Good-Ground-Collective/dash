import {
  TrackerAccountUnsupportedError,
  type TrackerQuery,
} from '@dash/integrations-core';
import { describe, expect, it } from 'vitest';

import { FakeGithubGraphql } from '#src/__tests__/support/fake-github-graphql.ts';
import { TrackerGithub } from '#src/__tests__/support/tracker-github.ts';
import { TrackerNodes } from '#src/__tests__/support/tracker-nodes.ts';

const query: TrackerQuery = {
  installationId: '42',
  account: { login: 'acme', kind: 'organization' },
};

describe('GithubTaskTracker initiatives', () => {
  it('reads an organisation’s Projects, closed ones as closed, with the latest status update’s target date', async () => {
    const snapshot = await TrackerGithub.organisation().tracker().read(query);

    expect(snapshot.initiatives).toEqual([
      {
        provider: 'github',
        externalId: 'PVT_1',
        url: 'https://github.com/orgs/acme/projects/1',
        level: 'initiative',
        title: 'Initiative 1',
        state: 'open',
        priority: null,
        dueDate: '2026-12-31',
        lastActivityAt: '2026-11-20T09:00:00Z',
      },
      expect.objectContaining({
        externalId: 'PVT_2',
        state: 'closed',
        dueDate: null,
      }),
    ]);
    expect(snapshot.truncated).toBe(false);
  });

  it('reads with an installation token and asks for at most 10 Projects', async () => {
    const github = TrackerGithub.organisation();

    await github.tracker().read(query);

    expect(github.callsTo('DashProjects')).toEqual([
      {
        operation: 'DashProjects',
        variables: { login: 'acme', first: 10 },
        authorization: 'token ghs_installation',
      },
    ]);
  });

  it('refuses a personal account without calling GitHub, because apps can’t read its Projects', async () => {
    const github = new FakeGithubGraphql();

    await expect(
      github
        .tracker()
        .read({ ...query, account: { login: 'ada', kind: 'user' } }),
    ).rejects.toThrow(TrackerAccountUnsupportedError);
    expect(github.tokenRequests).toEqual([]);
  });
});

describe('GithubTaskTracker epic fields', () => {
  it('takes priority from the Priority option and the due date from Target date', async () => {
    const snapshot = await TrackerGithub.organisation().tracker().read(query);

    expect(snapshot.epics[0]).toEqual({
      provider: 'github',
      externalId: 'I_10',
      url: 'https://github.com/acme/app/issues/10',
      level: 'epic',
      title: 'Issue 10',
      state: 'open',
      priority: 'P2',
      dueDate: '2026-12-15',
      lastActivityAt: '2026-11-20T09:00:00Z',
      initiativeIds: ['PVT_1'],
    });
  });

  it('falls back to a P1–P3 label without a Priority value', async () => {
    const snapshot = await TrackerGithub.withEpics([
      TrackerNodes.epicItem({ number: 20, labels: ['Epic', 'p3'] }),
    ])
      .tracker()
      .read(query);

    expect(snapshot.epics[0]).toMatchObject({ priority: 'P3' });
  });

  it.each([
    {
      order: 'label first',
      reversed: false,
      initiativeIds: ['PVT_1', 'PVT_2'],
    },
    { order: 'field first', reversed: true, initiativeIds: ['PVT_2', 'PVT_1'] },
  ])(
    'lists an epic in two Projects once, with another Project’s Priority over its label and the earliest Target date ($order)',
    async ({ reversed, initiativeIds }) => {
      const snapshot = await TrackerGithub.organisation({ reversed })
        .tracker()
        .read(query);

      expect(
        snapshot.epics.find(({ externalId }) => externalId === 'I_20'),
      ).toMatchObject({ priority: 'P1', dueDate: '2026-12-20', initiativeIds });
    },
  );

  it('keeps only issues labelled epic, skipping drafts and issues the App can’t see', async () => {
    const snapshot = await TrackerGithub.organisation().tracker().read(query);

    expect(snapshot.epics.map(({ externalId }) => externalId)).toEqual([
      'I_10',
      'I_20',
    ]);
  });
});

describe('GithubTaskTracker pagination', () => {
  it('follows epic pages with the cursor, at most two pages of 50 a Project', async () => {
    const github = TrackerGithub.endlessEpics();

    const snapshot = await github.tracker().read(query);

    expect(
      github
        .callsTo('DashProjectEpics')
        .map(({ variables }) => [variables['first'], variables['after']]),
    ).toEqual([
      [50, null],
      [50, '1'],
    ]);
    expect(github.callsTo('DashProjectEpics')[0]?.variables).toMatchObject({
      filter: 'label:epic',
      tickets: 50,
    });
    expect(snapshot.epics.map(({ externalId }) => externalId)).toEqual([
      'I_1',
      'I_2',
    ]);
    expect(snapshot.truncated).toBe(true);
  });
});

describe('GithubTaskTracker caps', () => {
  it('says it is truncated when an organisation has more than 10 Projects', async () => {
    const github = new FakeGithubGraphql().on({
      operation: 'DashProjects',
      reply: () => TrackerNodes.projects({ nodes: [], hasNextPage: true }),
    });

    const snapshot = await github.tracker().read(query);

    expect(snapshot).toMatchObject({ initiatives: [], truncated: true });
  });

  it('says it is truncated when an epic has more than 50 sub-issues', async () => {
    const github = TrackerGithub.withEpics([
      TrackerNodes.epicItem({
        number: 10,
        tickets: [TrackerNodes.ticket({ number: 11 })],
        ticketCount: 51,
      }),
    ]);

    const snapshot = await github.tracker().read(query);

    expect(snapshot.tickets).toHaveLength(1);
    expect(snapshot.truncated).toBe(true);
  });

  it('asks GitHub for enough assignees that a ticket with seven keeps all seven', async () => {
    const assignees = ['a', 'b', 'c', 'd', 'e', 'f', 'g'];
    const github = TrackerGithub.withTicketAssignees(assignees);

    const snapshot = await github.tracker().read(query);

    expect(snapshot.tickets[0]?.assignees).toEqual(assignees);
  });

  it('reads no epics when the organisation can’t be read', async () => {
    const github = new FakeGithubGraphql().on({
      operation: 'DashProjects',
      reply: () => ({ data: { organization: null } }),
    });

    const snapshot = await github.tracker().read(query);

    expect(snapshot).toEqual({
      initiatives: [],
      epics: [],
      tickets: [],
      activity: [],
      truncated: false,
    });
    expect(github.callsTo('DashProjectEpics')).toEqual([]);
  });
});
