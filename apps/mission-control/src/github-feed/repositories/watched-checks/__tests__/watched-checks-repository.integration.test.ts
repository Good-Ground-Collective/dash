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
import {
  adaId,
  graceId,
} from '#src/github-feed/__tests__/support/github-feed-fixtures.ts';
import { GithubRecordsDatabase } from '#src/github-feed/__tests__/support/github-records-database.ts';
import { DrizzleWatchedChecksRepository } from '#src/github-feed/repositories/watched-checks/watched-checks-repository.ts';

const databaseUrl = inject('databaseUrl');
let store: GithubRecordsDatabase | undefined;

class Repositories {
  static current(): DrizzleWatchedChecksRepository {
    return new DrizzleWatchedChecksRepository({
      database: GithubRecordsDatabase.required(store).database,
    });
  }
}

beforeAll(async () => {
  if (databaseUrl !== null) {
    store = await GithubRecordsDatabase.open({
      serverUrl: databaseUrl,
      name: 'dash_test_watched_checks',
    });
  }
});

beforeEach(async () => {
  if (store === undefined) {
    return;
  }
  await store.reset();
  const orm = store.database.orm;
  await orm.delete(userTable).where(eq(userTable.id, graceId));
  await orm
    .insert(userTable)
    .values({ id: graceId, name: 'Grace', email: 'grace@example.com' });
});

afterAll(async () => {
  await store?.close();
});

describe.skipIf(databaseUrl === null)(
  'DrizzleWatchedChecksRepository rules',
  () => {
    it('lists a person’s rules oldest first and keeps them to that person', async () => {
      const checks = Repositories.current();
      await checks.addRule({ userId: adaId, pattern: 'release' });
      await checks.addRule({ userId: adaId, pattern: 'Deploy*' });
      await checks.addRule({ userId: graceId, pattern: 'lint' });

      expect(
        (await checks.rulesFor({ userId: adaId })).map(
          ({ pattern }) => pattern,
        ),
      ).toEqual(['release', 'Deploy*']);
      expect(
        (await checks.rulesFor({ userId: graceId })).map(
          ({ pattern }) => pattern,
        ),
      ).toEqual(['lint']);
    });

    it('answers the existing rule when the same pattern is added again', async () => {
      const checks = Repositories.current();
      const first = await checks.addRule({ userId: adaId, pattern: 'build' });

      const again = await checks.addRule({ userId: adaId, pattern: 'build' });

      expect(again).toEqual(first);
      expect(await checks.rulesFor({ userId: adaId })).toHaveLength(1);
    });

    it('lets two people watch the same pattern', async () => {
      const checks = Repositories.current();

      const ada = await checks.addRule({ userId: adaId, pattern: 'build' });
      const grace = await checks.addRule({ userId: graceId, pattern: 'build' });

      expect(grace.id).not.toBe(ada.id);
    });

    it('removes only the person’s own rule', async () => {
      const checks = Repositories.current();
      const rule = await checks.addRule({ userId: adaId, pattern: 'build' });

      const byGrace = await checks.removeRule({
        userId: graceId,
        id: rule.id,
      });
      const byAda = await checks.removeRule({ userId: adaId, id: rule.id });
      const again = await checks.removeRule({ userId: adaId, id: rule.id });

      expect([byGrace, byAda, again]).toEqual([false, true, false]);
      expect(await checks.rulesFor({ userId: adaId })).toEqual([]);
    });
  },
);

describe.skipIf(databaseUrl === null)(
  'DrizzleWatchedChecksRepository exceptions',
  () => {
    const build = { repository: 'acme/app', checkName: 'build' } as const;

    it('stores one mode per repository and check, replacing the last', async () => {
      const checks = Repositories.current();
      await checks.setOverride({ userId: adaId, ...build, mode: 'watch' });
      await checks.setOverride({ userId: adaId, ...build, mode: 'ignore' });
      await checks.setOverride({
        userId: adaId,
        repository: 'acme/app',
        checkName: 'lint',
        mode: 'watch',
      });

      expect(await checks.overridesFor({ userId: adaId })).toEqual([
        { ...build, mode: 'ignore' },
        { repository: 'acme/app', checkName: 'lint', mode: 'watch' },
      ]);
    });

    it('clears one exception without touching another person’s', async () => {
      const checks = Repositories.current();
      await checks.setOverride({ userId: adaId, ...build, mode: 'watch' });
      await checks.setOverride({ userId: graceId, ...build, mode: 'ignore' });

      await checks.clearOverride({ userId: adaId, ...build });

      expect(await checks.overridesFor({ userId: adaId })).toEqual([]);
      expect(await checks.overridesFor({ userId: graceId })).toEqual([
        { ...build, mode: 'ignore' },
      ]);
    });
  },
);
