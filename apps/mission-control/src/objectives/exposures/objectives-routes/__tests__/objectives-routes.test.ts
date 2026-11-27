import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  adaId,
  fixedNow,
  graceId,
} from '#src/objectives/__tests__/support/objectives-fixtures.ts';
import { ObjectivesHarness } from '#src/objectives/__tests__/support/objectives-harness.ts';
import {
  type Objectives,
  objectivesSchema,
} from '#src/objectives/contracts/objectives.ts';

/** A request body as a client might send it, valid or not. */
type SentBody = Readonly<Record<string, string | number | boolean | null>>;

const running: ObjectivesHarness[] = [];

class Served {
  static async synced(): Promise<ObjectivesHarness> {
    const harness = await new ObjectivesHarness().sync();
    running.push(harness);
    return harness;
  }

  static async objectives(
    harness: ObjectivesHarness,
    query = '',
    userId = adaId,
  ): Promise<Objectives> {
    const response = await (
      await harness.start()
    ).inject({
      url: `/objectives${query}`,
      headers: ObjectivesHarness.cookie(userId),
    });
    expect(response.statusCode).toBe(200);
    return objectivesSchema.parse(response.json());
  }

  static async patch(
    harness: ObjectivesHarness,
    id: string,
    payload: SentBody,
  ) {
    return (await harness.start()).inject({
      method: 'PATCH',
      url: `/objectives/${id}/overlay`,
      headers: {
        ...ObjectivesHarness.cookie(adaId),
        'content-type': 'application/json',
      },
      payload: JSON.stringify(payload),
    });
  }

  static titles(objectives: Objectives): string[] {
    return objectives.initiatives.map(({ title }) => title);
  }
}

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'], now: fixedNow });
});

afterEach(async () => {
  await Promise.all(running.splice(0).map(async (harness) => harness.stop()));
  vi.useRealTimers();
});

describe('GET /objectives', () => {
  it('needs a signed-in person', async () => {
    const harness = await Served.synced();

    const response = await (
      await harness.start()
    ).inject({ url: '/objectives' });

    expect(response.statusCode).toBe(401);
    expect(response.json()).toMatchObject({ code: 'SIGN_IN_REQUIRED' });
  });

  it('shows nothing of connections another person made', async () => {
    const objectives = await Served.objectives(
      await Served.synced(),
      '',
      graceId,
    );

    expect(objectives).toEqual({ connections: [], initiatives: [] });
  });

  it('orders active initiatives by priority, then due date with none last', async () => {
    const harness = await Served.synced();

    expect(Served.titles(await Served.objectives(harness))).toEqual([
      'Launch',
      'Billing',
      'Docs',
    ]);
    await Served.patch(harness, 'PVT_docs', { priority: 'P1' });
    expect(Served.titles(await Served.objectives(harness))).toEqual([
      'Docs',
      'Launch',
      'Billing',
    ]);
  });

  it('orders epics the same way and gives each its progress, next ticket and flags', async () => {
    const [launch] = (await Served.objectives(await Served.synced()))
      .initiatives;

    expect(launch?.epics.map(({ id }) => id)).toEqual(['E2', 'E3', 'E1']);
    expect(launch?.epics[2]).toMatchObject({
      progress: { source: 'tracker', done: 1, total: 3 },
      nextTicket: { id: 'T3', priority: 'P1' },
      dueAfterInitiative: true,
      latestUpdate: { kind: 'commented', ticket: { id: 'T2' } },
    });
    expect(launch).toMatchObject({
      progress: { source: 'tracker', done: 0, total: 3 },
      nextTicket: { id: 'T3' },
      dueDate: { value: '2026-12-31', source: 'tracker' },
    });
  });
});

describe('GET /objectives filters', () => {
  it('hides parked and done initiatives unless asked for them', async () => {
    const harness = await Served.synced();
    await Served.patch(harness, 'PVT_billing', { parked: true });

    expect(Served.titles(await Served.objectives(harness))).toEqual([
      'Launch',
      'Docs',
    ]);
    expect(
      Served.titles(await Served.objectives(harness, '?status=parked,done')),
    ).toEqual(['Archive', 'Billing']);
  });

  it('rejects a status it doesn’t know', async () => {
    const harness = await Served.synced();

    const response = await (
      await harness.start()
    ).inject({
      url: '/objectives?status=active,someday',
      headers: ObjectivesHarness.cookie(adaId),
    });

    expect(response.statusCode).toBe(400);
  });

  it('says how the last read of each connection went', async () => {
    const objectives = await Served.objectives(await Served.synced());

    expect(objectives.connections).toEqual([
      {
        id: expect.any(String),
        accountLogin: 'acme',
        lastSyncedAt: fixedNow.toISOString(),
        lastError: null,
        truncated: false,
      },
    ]);
  });
});

describe('PATCH /objectives/:id/overlay', () => {
  it('keeps a parked initiative parked through a re-sync', async () => {
    const harness = await Served.synced();
    expect(
      (await Served.patch(harness, 'PVT_launch', { parked: true })).json(),
    ).toEqual({
      id: 'PVT_launch',
      parked: true,
      manualProgress: null,
      priority: null,
      dueDate: null,
    });

    vi.setSystemTime(new Date(fixedNow.getTime() + 15 * 60_000));
    await harness.sync();

    const parked = await Served.objectives(harness, '?status=parked');
    expect(parked.initiatives).toEqual([
      expect.objectContaining({ id: 'PVT_launch', status: 'parked' }),
    ]);
  });

  it('shows manual progress and a Dash priority where the tracker has none', async () => {
    const harness = await Served.synced();
    await Served.patch(harness, 'PVT_docs', {
      manualProgress: 40,
      priority: 'P3',
      dueDate: '2027-02-01',
    });

    const docs = (await Served.objectives(harness)).initiatives.find(
      ({ id }) => id === 'PVT_docs',
    );
    expect(docs).toMatchObject({
      progress: { source: 'manual', percent: 40 },
      priority: { value: 'P3', source: 'dash' },
      dueDate: { value: '2027-02-01', source: 'dash' },
    });
  });
});

describe('PATCH /objectives/:id/overlay validation', () => {
  it.each([
    ['an empty change', {}],
    ['progress over 100', { manualProgress: 101 }],
    ['a priority outside P1 to P3', { priority: 'P4' }],
    ['a due date with a time', { dueDate: '2027-01-01T00:00:00Z' }],
    ['a field Dash doesn’t keep', { status: 'done' }],
  ])('rejects %s', async (_label, payload) => {
    const response = await Served.patch(
      await Served.synced(),
      'PVT_docs',
      payload,
    );

    expect(response.statusCode).toBe(400);
  });

  it('refuses fields the tracker already sets', async () => {
    const harness = await Served.synced();

    const due = await Served.patch(harness, 'PVT_launch', {
      dueDate: '2027-01-01',
    });
    const progress = await Served.patch(harness, 'E1', { manualProgress: 50 });

    expect([due.statusCode, progress.statusCode]).toEqual([409, 409]);
    expect(due.json()).toMatchObject({ code: 'TRACKER_OWNS_FIELD' });
  });

  it('clears Dash’s value of a field the tracker now sets', async () => {
    const harness = await Served.synced();

    const due = await Served.patch(harness, 'PVT_launch', { dueDate: null });
    const progress = await Served.patch(harness, 'E1', {
      manualProgress: null,
    });

    expect([due.statusCode, progress.statusCode]).toEqual([200, 200]);
    expect(due.json()).toMatchObject({ id: 'PVT_launch', dueDate: null });
  });

  it('answers 404 for an id outside the person’s connections', async () => {
    const response = await Served.patch(await Served.synced(), 'PVT_other', {
      parked: true,
    });

    expect(response.statusCode).toBe(404);
    expect(response.json()).toMatchObject({ code: 'OBJECTIVE_NOT_FOUND' });
  });
});
