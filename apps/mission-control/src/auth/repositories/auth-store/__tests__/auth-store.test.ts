import { afterEach, describe, expect, it } from 'vitest';
import { z } from 'zod';

import { DrizzleAuthStore } from '#src/auth/repositories/auth-store/auth-store.ts';
import { PostgresDatabase } from '#src/platform/services/database/database.ts';

const adapterSchema = z.object({
  options: z.object({
    adapterConfig: z.object({ transaction: z.unknown() }),
  }),
});

const database = new PostgresDatabase({
  url: 'postgres://dash:dash@127.0.0.1:1/never_connected',
});

afterEach(async () => {
  await database.close();
});

describe('DrizzleAuthStore', () => {
  it('turns on transactions, which the Drizzle adapter leaves off by default', () => {
    const { storage } = new DrizzleAuthStore({ database });
    if (!(storage instanceof Function)) {
      throw new TypeError('Expected the Drizzle adapter factory');
    }

    const adapter = adapterSchema.parse(storage({}));

    expect(adapter.options.adapterConfig.transaction).toBeInstanceOf(Function);
  });
});
