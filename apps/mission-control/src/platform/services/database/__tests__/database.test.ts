import { describe, expect, it } from 'vitest';
import { ZodError } from 'zod';

import { PostgresDatabase } from '#src/platform/services/database/database.ts';

describe('PostgresDatabase', () => {
  it('rejects a connection URL that is not Postgres', () => {
    expect(() => new PostgresDatabase({ url: 'not-a-url' })).toThrow(ZodError);
  });
});
