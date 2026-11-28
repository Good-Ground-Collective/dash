import { z } from 'zod';

const fallbackTimeZone = 'America/New_York';

const timeZoneChangeSchema = z.object({
  timeZone: z.string().regex(/^[A-Za-z][\w+-]*(?:\/[\w+-]+)*$/u),
});

export interface TimeZoneStubAnswer {
  status: number;
  body: object;
}

/** Mission Control's `/api/people/me/time-zone` for the e2e tests' one person, in memory. `saves` counts what browsers sent. */
export class TimeZoneStub {
  private timeZone = fallbackTimeZone;
  private saves = 0;

  reset(): void {
    this.timeZone = fallbackTimeZone;
    this.saves = 0;
  }

  save(props: { body: string; signedIn: boolean }): TimeZoneStubAnswer {
    if (!props.signedIn) {
      return { status: 401, body: { code: 'SIGN_IN_REQUIRED' } };
    }
    const change = timeZoneChangeSchema.safeParse(
      JSON.parse(props.body || '{}'),
    );
    if (!change.success) {
      return { status: 400, body: { code: 'TIME_ZONE_REJECTED' } };
    }
    this.timeZone = change.data.timeZone;
    this.saves += 1;
    return { status: 200, body: change.data };
  }

  /** How many saves browsers have sent since the last reset. */
  count(): TimeZoneStubAnswer {
    return { status: 200, body: { saves: this.saves } };
  }

  /** The person as the session lookup returns them, with their zone. */
  withTimeZone<T extends object>(person: T): T & { timeZone: string } {
    return { ...person, timeZone: this.timeZone };
  }
}
