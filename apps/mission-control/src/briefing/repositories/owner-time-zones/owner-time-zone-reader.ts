import { asc, eq } from 'drizzle-orm';
import { z } from 'zod';

import { userTable } from '#src/auth/repositories/auth-store/auth-store-table.ts';
import { IanaTimeZones } from '#src/auth/definitions/time-zones/time-zones.ts';
import type { Database } from '#src/platform/services/database/database.ts';

const readerPropsSchema = z.object({
  database: z.custom<Database>(),
});

/** Dash has one owner, and the budget month and its spend follow where they are. */
export interface OwnerTimeZoneReader {
  /** The owner's time zone, or the fallback zone while no person has signed up. */
  zone(): Promise<string>;
}

/** The owner is the first person to sign up: the oldest `user` row of kind `user`. */
export class DrizzleOwnerTimeZoneReader implements OwnerTimeZoneReader {
  private readonly database: Database;

  constructor(props: z.input<typeof readerPropsSchema>) {
    this.database = readerPropsSchema.parse(props).database;
  }

  async zone(): Promise<string> {
    const [owner] = await this.database.orm
      .select({ timeZone: userTable.timeZone })
      .from(userTable)
      .where(eq(userTable.kind, 'user'))
      .orderBy(asc(userTable.createdAt), asc(userTable.id))
      .limit(1);
    return owner?.timeZone ?? IanaTimeZones.FALLBACK;
  }
}
