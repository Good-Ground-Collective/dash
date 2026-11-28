import { asc, eq } from 'drizzle-orm';
import { z } from 'zod';

import { userTable } from '#src/auth/repositories/auth-store/auth-store-table.ts';
import type { Database } from '#src/platform/services/database/database.ts';

const readerPropsSchema = z.object({
  database: z.custom<Database>(),
});

export interface PersonTimeZone {
  userId: string;
  timeZone: string;
}

/** Each person's briefing arrives at their own 07:00, 09:00, 12:00 and 17:00. */
export interface PersonTimeZoneReader {
  /** Every person, with the time zone their browser last reported. Services are not people. */
  people(): Promise<PersonTimeZone[]>;
}

export class DrizzlePersonTimeZoneReader implements PersonTimeZoneReader {
  private readonly database: Database;

  constructor(props: z.input<typeof readerPropsSchema>) {
    this.database = readerPropsSchema.parse(props).database;
  }

  async people(): Promise<PersonTimeZone[]> {
    return this.database.orm
      .select({ userId: userTable.id, timeZone: userTable.timeZone })
      .from(userTable)
      .where(eq(userTable.kind, 'user'))
      .orderBy(asc(userTable.createdAt), asc(userTable.id));
  }
}
