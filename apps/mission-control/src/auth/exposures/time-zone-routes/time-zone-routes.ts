import { z } from 'zod';

import { personTimeZoneSchema } from '#src/auth/contracts/time-zone.ts';
import {
  TimeZoneRejectedError,
  TimeZoneSignInRequiredError,
} from '#src/auth/errors.ts';
import type { Identity } from '#src/auth/services/identity/identity.ts';
import type { PersonTimeZones } from '#src/auth/services/person-time-zones/person-time-zones.ts';
import { SignedInPerson } from '#src/auth/services/signed-in-person/signed-in-person.ts';
import type { ZodFastifyInstance } from '#src/platform/contracts/http-module.ts';

const timeZoneRoutesPropsSchema = z.object({
  timeZones: z.custom<PersonTimeZones>(),
  identity: z.custom<Pick<Identity, 'session'>>(),
});

/** `POST /api/people/me/time-zone`: the web app reports the signed-in person's browser zone. Callers who aren't a signed-in person get 401 before the zone is read. */
export class TimeZoneRoutes {
  private readonly timeZones: PersonTimeZones;
  private readonly person: SignedInPerson;

  constructor(props: z.input<typeof timeZoneRoutesPropsSchema>) {
    const parsed = timeZoneRoutesPropsSchema.parse(props);
    this.timeZones = parsed.timeZones;
    this.person = new SignedInPerson({ identity: parsed.identity });
  }

  register(app: ZodFastifyInstance): void {
    app.post(
      '/api/people/me/time-zone',
      { schema: { response: { 200: personTimeZoneSchema } } },
      async (request) => {
        const personId = await this.person.of(request);
        if (personId === null) {
          throw new TimeZoneSignInRequiredError();
        }

        const change = personTimeZoneSchema.safeParse(request.body);
        if (!change.success) {
          throw new TimeZoneRejectedError();
        }
        return this.timeZones.save({ personId, ...change.data });
      },
    );
  }
}
