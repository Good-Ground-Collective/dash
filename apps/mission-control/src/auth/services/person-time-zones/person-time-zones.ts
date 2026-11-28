import type { BetterAuthPlugin } from 'better-auth';
import { z } from 'zod';

import type { PersonTimeZone } from '#src/auth/contracts/time-zone.ts';
import { IanaTimeZones } from '#src/auth/definitions/time-zones/time-zones.ts';
import type { Identity } from '#src/auth/services/identity/identity.ts';

const betterAuthPersonTimeZonesPropsSchema = z.object({
  identity: z.custom<Pick<Identity, 'auth'>>(),
});

/** Where each person is, so work Dash schedules for them runs on their wall clock. */
export interface PersonTimeZones {
  save(props: { personId: string } & PersonTimeZone): Promise<PersonTimeZone>;
}

/** Keeps the zone on Better Auth's `user`, beside the appearance, so the session lookup returns it with the viewer. */
export class BetterAuthPersonTimeZones implements PersonTimeZones {
  private readonly identity: Pick<Identity, 'auth'>;

  constructor(props: z.input<typeof betterAuthPersonTimeZonesPropsSchema>) {
    this.identity = betterAuthPersonTimeZonesPropsSchema.parse(props).identity;
  }

  async save(
    props: { personId: string } & PersonTimeZone,
  ): Promise<PersonTimeZone> {
    const context = await this.identity.auth.$context;
    await context.internalAdapter.updateUser(props.personId, {
      timeZone: props.timeZone,
    });
    return { timeZone: props.timeZone };
  }

  /** Adds `timeZone` to Better Auth's `user`, defaulting to `America/New_York`, out of reach of its own profile update. */
  static readonly PLUGIN: BetterAuthPlugin = {
    id: 'time-zone',
    schema: {
      user: {
        fields: {
          timeZone: {
            type: 'string',
            required: true,
            defaultValue: IanaTimeZones.FALLBACK,
            input: false,
          },
        },
      },
    },
  };
}
