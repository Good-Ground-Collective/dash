import { eq } from 'drizzle-orm';
import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  inject,
  it,
} from 'vitest';

import { userTable } from '#src/auth/repositories/auth-store/auth-store-table.ts';
import { BriefingsDatabase } from '#src/briefing/__tests__/support/briefings-database.ts';
import {
  adaId,
  graceId,
} from '#src/objectives/__tests__/support/objectives-fixtures.ts';

const databaseUrl = inject('databaseUrl');
let store: BriefingsDatabase | undefined;

beforeAll(async () => {
  if (databaseUrl !== null) {
    store = await BriefingsDatabase.open({
      serverUrl: databaseUrl,
      name: 'dash_test_person_time_zone_reader',
    });
  }
});

beforeEach(async () => {
  await store?.reset();
});

afterAll(async () => {
  await store?.close();
});

describe.skipIf(databaseUrl === null)('DrizzlePersonTimeZoneReader', () => {
  it('lists each person with their own zone and leaves services out', async () => {
    const { database, people } = BriefingsDatabase.required(store);
    await database.orm
      .update(userTable)
      .set({ timeZone: 'Asia/Tokyo' })
      .where(eq(userTable.id, graceId));
    await database.orm.insert(userTable).values({
      name: 'Bot',
      email: 'bot@example.com',
      kind: 'service',
    });

    await expect(people.people()).resolves.toEqual([
      { userId: adaId, timeZone: 'America/New_York' },
      { userId: graceId, timeZone: 'Asia/Tokyo' },
    ]);
  });
});
