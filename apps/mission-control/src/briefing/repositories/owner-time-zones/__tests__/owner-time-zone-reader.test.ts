import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  inject,
  it,
} from 'vitest';

import { BriefingsDatabase } from '#src/briefing/__tests__/support/briefings-database.ts';
import { userTable } from '#src/auth/repositories/auth-store/auth-store-table.ts';
import { eq } from 'drizzle-orm';
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
      name: 'dash_test_owner_time_zone_reader',
    });
  }
});

beforeEach(async () => {
  await store?.reset();
});

afterAll(async () => {
  await store?.close();
});

describe.skipIf(databaseUrl === null)('DrizzleOwnerTimeZoneReader', () => {
  it('follows the first person to sign up', async () => {
    const { database, ownerTimeZone } = BriefingsDatabase.required(store);
    await database.orm
      .update(userTable)
      .set({ timeZone: 'Europe/London' })
      .where(eq(userTable.id, adaId));
    await database.orm
      .update(userTable)
      .set({ timeZone: 'Asia/Tokyo' })
      .where(eq(userTable.id, graceId));

    await expect(ownerTimeZone.zone()).resolves.toBe('Europe/London');
  });

  it('skips services that signed up before the first person', async () => {
    const { database, ownerTimeZone } = BriefingsDatabase.required(store);
    await database.orm.insert(userTable).values({
      name: 'Bot',
      email: 'bot@example.com',
      kind: 'service',
      timeZone: 'Asia/Tokyo',
      createdAt: new Date('2025-01-01T00:00:00Z'),
    });
    await database.orm
      .update(userTable)
      .set({ timeZone: 'Europe/London' })
      .where(eq(userTable.id, adaId));

    await expect(ownerTimeZone.zone()).resolves.toBe('Europe/London');
  });

  it('falls back to the default zone while no person has signed up', async () => {
    const { database, ownerTimeZone } = BriefingsDatabase.required(store);
    await database.orm.delete(userTable);

    await expect(ownerTimeZone.zone()).resolves.toBe('America/New_York');
  });
});
