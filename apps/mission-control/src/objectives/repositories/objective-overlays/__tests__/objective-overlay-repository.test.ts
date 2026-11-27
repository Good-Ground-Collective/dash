import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  inject,
  it,
} from 'vitest';

import { ObjectiveRecordsDatabase } from '#src/objectives/__tests__/support/objective-records-database.ts';
import {
  adaId,
  graceId,
} from '#src/objectives/__tests__/support/objectives-fixtures.ts';

const databaseUrl = inject('databaseUrl');
let store: ObjectiveRecordsDatabase | undefined;

beforeAll(async () => {
  if (databaseUrl !== null) {
    store = await ObjectiveRecordsDatabase.open({
      serverUrl: databaseUrl,
      name: 'dash_test_objective_overlay_repository',
    });
  }
});

beforeEach(async () => {
  await store?.reset();
});

afterAll(async () => {
  await store?.close();
});

describe.skipIf(databaseUrl === null)(
  'DrizzleObjectiveOverlayRepository',
  () => {
    it('changes only the fields given and clears a field set to null', async () => {
      const overlays = ObjectiveRecordsDatabase.required(store).overlays;

      await overlays.save({
        userId: adaId,
        id: 'PVT_docs',
        changes: { parked: true, priority: 'P2', manualProgress: 30 },
      });
      const saved = await overlays.save({
        userId: adaId,
        id: 'PVT_docs',
        changes: { priority: null, dueDate: '2027-02-01' },
      });

      expect(saved).toEqual({
        id: 'PVT_docs',
        parked: true,
        manualProgress: 30,
        priority: null,
        dueDate: '2027-02-01',
      });
    });

    it('keeps each person’s overlays to themselves', async () => {
      const overlays = ObjectiveRecordsDatabase.required(store).overlays;
      await overlays.save({
        userId: adaId,
        id: 'PVT_docs',
        changes: { parked: true },
      });

      expect([...(await overlays.listFor({ userId: adaId })).keys()]).toEqual([
        'PVT_docs',
      ]);
      expect((await overlays.listFor({ userId: graceId })).size).toBe(0);
    });
  },
);
