import { describe, expect, it } from 'vitest';

import { ObjectivesFixtures } from '#src/objectives/__tests__/support/objectives-fixtures.ts';
import { TrackerRecords } from '#src/objectives/services/tracker-records/tracker-records.ts';

describe('TrackerRecords', () => {
  it('places each epic in the initiatives read, and keeps tickets in order', () => {
    const records = TrackerRecords.from(ObjectivesFixtures.snapshot());

    expect(records.placements).toEqual([
      { initiativeNodeId: 'PVT_launch', epicNodeId: 'E1' },
      { initiativeNodeId: 'PVT_launch', epicNodeId: 'E2' },
      { initiativeNodeId: 'PVT_launch', epicNodeId: 'E3' },
    ]);
    expect(
      records.tickets
        .filter(({ epicNodeId }) => epicNodeId === 'E1')
        .map(({ nodeId, position }) => [nodeId, position]),
    ).toEqual([
      ['T1', 0],
      ['T2', 1],
      ['T3', 2],
    ]);
  });

  it('drops epics outside every initiative read, with their tickets and activity', () => {
    const snapshot = ObjectivesFixtures.snapshot();
    const records = TrackerRecords.from({
      ...snapshot,
      epics: snapshot.epics.map((epic) =>
        epic.externalId === 'E1'
          ? { ...epic, initiativeIds: ['PVT_gone'] }
          : epic,
      ),
    });

    expect(records.epics.map(({ nodeId }) => nodeId)).toEqual(['E2', 'E3']);
    expect(records.tickets.map(({ nodeId }) => nodeId)).toEqual(['T4']);
    expect(records.activity).toEqual([]);
  });
});
