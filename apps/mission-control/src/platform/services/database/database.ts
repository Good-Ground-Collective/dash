import { drizzle, type NodePgDatabase } from 'drizzle-orm/node-postgres';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import pg from 'pg';
import { z } from 'zod';

import type { HealthProbe } from '#src/platform/contracts/health-probe.ts';
import { postgresUrlSchema } from '#src/platform/definitions/config/app-config.ts';

export const databasePropsSchema = z.object({
  url: postgresUrlSchema,
  queryTimeoutMilliseconds: z
    .number()
    .int()
    .nonnegative()
    .default(5000)
    .describe(
      'Client-side bound on each query, so a stalled health probe releases its connection. 0 disables it, as migrations do.',
    ),
});

export interface Database extends HealthProbe {
  readonly orm: NodePgDatabase;
  close(): Promise<void>;
  migrate(props: { migrationsFolder: string }): Promise<void>;
}

export class PostgresDatabase implements Database {
  readonly name = 'database';
  readonly orm: NodePgDatabase;
  private readonly pool: pg.Pool;

  constructor(props: z.input<typeof databasePropsSchema>) {
    const { url, queryTimeoutMilliseconds } = databasePropsSchema.parse(props);
    this.pool = new pg.Pool({
      connectionString: url,
      connectionTimeoutMillis: 5000,
      query_timeout: queryTimeoutMilliseconds,
    });
    this.orm = drizzle({ client: this.pool });
  }

  async check(): Promise<void> {
    await this.pool.query('select 1');
  }

  async close(): Promise<void> {
    await this.pool.end();
  }

  async migrate(props: { migrationsFolder: string }): Promise<void> {
    await migrate(this.orm, { migrationsFolder: props.migrationsFolder });
  }
}
