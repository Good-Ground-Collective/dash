import { describe, expect, it } from 'vitest';
import { Fixtures } from '#lib/home/__tests__/support/since-yesterday-fixtures.ts';
import { SampleFeed } from '#lib/github-feed/__tests__/support/sample-feed.ts';
import { SampleObjectives } from '#lib/objectives/__tests__/support/sample-objectives.ts';

const launch = SampleObjectives.initiative({
  epics: [
    Fixtures.epic({ id: 'E_a', own: 10, first: 100 }),
    Fixtures.epic({ id: 'E_b', own: 11, first: 200 }),
  ],
});

describe('SinceYesterdayGroups attribution', () => {
  it('places a merge under the epic whose task it closes, counting merges and closed issues', () => {
    const groups = Fixtures.groups({
      merges: [
        Fixtures.merge({ id: 'm1', closes: [100] }),
        Fixtures.merge({ id: 'm2', closes: [101, 102] }),
      ],
      objectives: Fixtures.state([launch]),
    });

    expect(groups).toHaveLength(1);
    expect(groups[0]).toMatchObject({
      id: 'epic:E_a',
      kind: 'epic',
      title: 'Epic E_a',
      summary: '2 merged · 3 closed',
      href: 'https://github.com/acme-labs/api/issues/10',
    });
    expect(groups[0]?.progress).toMatchObject({ label: '3 of 5 done' });
  });

  it('places a merge that closes the epic’s own issue under that epic', () => {
    const groups = Fixtures.groups({
      merges: [Fixtures.merge({ id: 'm1', closes: [11] })],
      objectives: Fixtures.state([launch]),
    });

    expect(groups.map(({ id }) => id)).toEqual(['epic:E_b']);
  });

  it('places a merge under an epic with more than 25 open tasks when the task it closes is past the listed ones', () => {
    const crowded = SampleObjectives.initiative({
      epics: [Fixtures.epic({ id: 'E_big', own: 10, first: 100, tasks: 30 })],
    });

    const groups = Fixtures.groups({
      merges: [Fixtures.merge({ id: 'm1', closes: [128] })],
      objectives: Fixtures.state([crowded]),
    });

    expect(groups.map(({ id }) => id)).toEqual(['epic:E_big']);
    expect(groups[0]).toMatchObject({ summary: '1 merged · 1 closed' });
  });

  it('puts a merge that closes nothing under Other merges', () => {
    const groups = Fixtures.groups({
      merges: [Fixtures.merge({ id: 'm1' })],
      objectives: Fixtures.state([launch]),
    });

    expect(groups).toMatchObject([
      { id: 'other-merges', title: 'Other merges', summary: '1 merged' },
    ]);
  });

  it('puts a merge that closes an issue no epic owns under Other merges', () => {
    const groups = Fixtures.groups({
      merges: [Fixtures.merge({ id: 'm1', closes: [999] })],
      objectives: Fixtures.state([launch]),
    });

    expect(groups.map(({ id }) => id)).toEqual(['other-merges']);
  });
});

describe('SinceYesterdayGroups attribution edges', () => {
  it('matches the repository without regard to case', () => {
    const groups = Fixtures.groups({
      merges: [
        SampleFeed.pull({
          id: 'm1',
          state: 'merged',
          mergedAt: Fixtures.hoursAgo(1),
          closingIssues: [{ repository: 'Acme-Labs/API', number: 100 }],
        }),
      ],
      objectives: Fixtures.state([launch]),
    });

    expect(groups.map(({ id }) => id)).toEqual(['epic:E_a']);
  });

  it('keeps a merge that closes issues of two epics under the first, counting only that epic’s issues', () => {
    const groups = Fixtures.groups({
      merges: [Fixtures.merge({ id: 'm1', closes: [100, 200] })],
      objectives: Fixtures.state([launch]),
    });

    expect(groups).toHaveLength(1);
    expect(groups[0]).toMatchObject({
      id: 'epic:E_a',
      summary: '1 merged · 1 closed',
    });
  });

  it('puts every merge under Other merges when objectives are missing or failed', () => {
    const merges = [
      Fixtures.merge({ id: 'm1', closes: [100] }),
      Fixtures.merge({ id: 'm2' }),
    ];

    for (const objectives of [null, { status: 'failed' } as const]) {
      const groups = Fixtures.groups({ merges, objectives });

      expect(groups).toMatchObject([
        { id: 'other-merges', summary: '2 merged' },
      ]);
    }
  });

  it('leaves out merges older than 24 hours', () => {
    const groups = Fixtures.groups({
      merges: [
        Fixtures.merge({ id: 'old', closes: [100], hours: 25 }),
        Fixtures.merge({ id: 'new', closes: [100], hours: 23 }),
      ],
      objectives: Fixtures.state([launch]),
    });

    expect(groups[0]?.sections[0]?.rows.map(({ id }) => id)).toEqual(['new']);
  });
});

describe('SinceYesterdayGroups order', () => {
  const closedEpic = Fixtures.epic({
    id: 'E_done',
    own: 20,
    first: 300,
    overrides: { status: 'done' },
  });
  const closedInitiative = SampleObjectives.initiative({
    id: 'PVT_done',
    title: 'Beta',
    status: 'done',
    epics: [Fixtures.epic({ id: 'E_beta', own: 30, first: 400 })],
  });
  const initiatives = [
    SampleObjectives.initiative({
      id: 'PVT_live',
      epics: [
        Fixtures.epic({ id: 'E_few', own: 40, first: 500 }),
        Fixtures.epic({ id: 'E_many', own: 41, first: 600 }),
        closedEpic,
      ],
    }),
    closedInitiative,
  ];

  it('leads with what closed, then epics by merged count, then Releases, then Other merges', () => {
    const groups = Fixtures.groups({
      merges: [
        Fixtures.merge({ id: 'few', closes: [500] }),
        Fixtures.merge({ id: 'many-1', closes: [600] }),
        Fixtures.merge({ id: 'many-2', closes: [601] }),
        Fixtures.merge({ id: 'epic-done', closes: [300] }),
        Fixtures.merge({ id: 'beta', closes: [400] }),
        Fixtures.merge({ id: 'loose' }),
      ],
      releases: [SampleFeed.release({ publishedAt: Fixtures.hoursAgo(1) })],
      objectives: Fixtures.state(initiatives),
    });

    expect(groups.map(({ id }) => id)).toEqual([
      'initiative:PVT_done',
      'epic:E_done',
      'epic:E_many',
      'epic:E_few',
      'releases',
      'other-merges',
    ]);
    expect(groups[0]).toMatchObject({
      kind: 'initiative',
      title: 'Beta',
      summary: '1 merged · 1 closed',
    });
    expect(groups[0]?.sections).toMatchObject([
      { title: 'Epic E_beta', summary: '1 merged · 1 closed' },
    ]);
  });
});

describe('SinceYesterdayGroups releases', () => {
  it('counts releases and lists them newest first', () => {
    const groups = Fixtures.groups({
      merges: [],
      releases: [
        SampleFeed.release({ id: 'r-old', publishedAt: Fixtures.hoursAgo(9) }),
        SampleFeed.release({ id: 'r-new', publishedAt: Fixtures.hoursAgo(1) }),
        SampleFeed.release({ id: 'r-out', publishedAt: Fixtures.hoursAgo(30) }),
      ],
      objectives: null,
    });

    expect(groups).toHaveLength(1);
    expect(groups[0]).toMatchObject({
      kind: 'releases',
      summary: '2 releases',
    });
    expect(groups[0]?.sections[0]?.rows.map(({ id }) => id)).toEqual([
      'r-new',
      'r-old',
    ]);
  });

  it('says “1 release” for one', () => {
    const groups = Fixtures.groups({
      merges: [],
      releases: [SampleFeed.release({ publishedAt: Fixtures.hoursAgo(1) })],
      objectives: null,
    });

    expect(groups[0]?.summary).toBe('1 release');
  });
});

const sevenEpics = SampleObjectives.initiative({
  epics: Array.from({ length: 7 }, (_, index) =>
    Fixtures.epic({
      id: `E_${String(index)}`,
      own: 10 + index,
      first: 100 * (index + 1),
    }),
  ),
});

describe('SinceYesterdayGroups cap', () => {
  it('shows six epics as they are', () => {
    const groups = Fixtures.groups({
      merges: Fixtures.mergesFor([1, 1, 1, 1, 1, 1]),
      objectives: Fixtures.state([sevenEpics]),
    });

    expect(groups).toHaveLength(6);
    expect(groups.every(({ kind }) => kind === 'epic')).toBe(true);
  });

  it('folds the smallest epics into one “N more epics” item when seven qualify', () => {
    const groups = Fixtures.groups({
      merges: Fixtures.mergesFor([7, 6, 5, 4, 3, 2, 1]),
      objectives: Fixtures.state([sevenEpics]),
    });

    expect(groups.map(({ id }) => id)).toEqual([
      'epic:E_0',
      'epic:E_1',
      'epic:E_2',
      'epic:E_3',
      'epic:E_4',
      'more-epics',
    ]);
    const more = groups.at(-1);
    expect(more).toMatchObject({
      kind: 'more-epics',
      title: '2 more epics',
      summary: '3 merged',
    });
    expect(more?.sections.map(({ title }) => title)).toEqual([
      'Epic E_5',
      'Epic E_6',
    ]);
  });
});

describe('SinceYesterdayGroups cap with Releases and Other merges', () => {
  it('keeps Releases and Other merges inside the six', () => {
    const groups = Fixtures.groups({
      merges: [
        ...Fixtures.mergesFor([7, 6, 5, 4, 3, 2, 1]),
        Fixtures.merge({ id: 'x' }),
      ],
      releases: [SampleFeed.release({ publishedAt: Fixtures.hoursAgo(1) })],
      objectives: Fixtures.state([sevenEpics]),
    });

    expect(groups).toHaveLength(6);
    expect(groups.map(({ kind }) => kind)).toEqual([
      'epic',
      'epic',
      'epic',
      'more-epics',
      'releases',
      'other-merges',
    ]);
    expect(groups[3]).toMatchObject({ title: '4 more epics' });
  });

  it('counts a closed initiative as one item toward the six', () => {
    const closed = SampleObjectives.initiative({
      id: 'PVT_done',
      title: 'Beta',
      status: 'done',
      epics: [Fixtures.epic({ id: 'E_beta', own: 30, first: 900 })],
    });
    const groups = Fixtures.groups({
      merges: [
        ...Fixtures.mergesFor([7, 6, 5, 4, 3, 2, 1]),
        Fixtures.merge({ id: 'b', closes: [900] }),
      ],
      objectives: Fixtures.state([closed, sevenEpics]),
    });

    expect(groups).toHaveLength(6);
    expect(groups.at(-1)).toMatchObject({
      title: '3 more epics',
    });
    expect(groups[0]).toMatchObject({ kind: 'initiative' });
  });
});
