import { ZodError } from 'zod';
import { describe, expect, it } from 'vitest';

import { PostgresDatabase } from '#src/platform/services/database/database.ts';

describe('PostgresDatabase', () => {
  it('rejects a connection URL that is not Postgres', () => {
    expect(() => new PostgresDatabase({ url: 'not-a-url' })).toThrow(ZodError);
  });
});
