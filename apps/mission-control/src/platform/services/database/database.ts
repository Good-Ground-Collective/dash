import { drizzle, type NodePgDatabase } from 'drizzle-orm/node-postgres';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import pg from 'pg';

import type { HealthProbe } from '#src/platform/contracts/health-probe.ts';

/** The application's Postgres pool and its Drizzle query builder. */
export class Database implements HealthProbe {
  readonly name = 'database';
  readonly orm: NodePgDatabase;
  private readonly pool: pg.Pool;

  constructor(props: { url: string }) {
    this.pool = new pg.Pool({ connectionString: props.url });
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
