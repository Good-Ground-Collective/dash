import type { FastifyRequest } from 'fastify';
import { z } from 'zod';

import type { Identity } from '#src/auth/services/identity/identity.ts';
import { SignedInPerson } from '#src/auth/services/signed-in-person/signed-in-person.ts';
import {
  type Briefings,
  briefingsQuerySchema,
  briefingsSchema,
} from '#src/briefing/contracts/briefings.ts';
import { BriefingSignInRequiredError } from '#src/briefing/errors.ts';
import type { BriefingRepository } from '#src/briefing/repositories/briefings/briefing-repository.ts';
import type { OwnerTimeZoneReader } from '#src/briefing/repositories/owner-time-zones/owner-time-zone-reader.ts';
import { BudgetMonth } from '#src/briefing/services/budget-month/budget-month.ts';
import type { ZodFastifyInstance } from '#src/platform/contracts/http-module.ts';
import type { BriefingSettings } from '#src/platform/definitions/config/app-config.ts';

const microUsdPerUsd = 1_000_000;

const briefingRoutesPropsSchema = z.object({
  briefings:
    z.custom<
      Pick<
        BriefingRepository,
        'latestSucceeded' | 'latestRun' | 'history' | 'spentSince'
      >
    >(),
  ownerTimeZone: z.custom<OwnerTimeZoneReader>(),
  settings: z.custom<Pick<BriefingSettings, 'monthlyBudgetUsd'>>().nullable(),
  identity: z.custom<Pick<Identity, 'session'>>(),
});

/**
 * `GET /briefings`, the signed-in person's latest good briefing, their latest run, recent
 * history, and this month's instance-wide spend against the budget.
 */
export class BriefingRoutes {
  private readonly briefings: Pick<
    BriefingRepository,
    'latestSucceeded' | 'latestRun' | 'history' | 'spentSince'
  >;
  private readonly ownerTimeZone: OwnerTimeZoneReader;
  private readonly settings: Pick<BriefingSettings, 'monthlyBudgetUsd'> | null;
  private readonly person: SignedInPerson;

  constructor(input: z.input<typeof briefingRoutesPropsSchema>) {
    const props = briefingRoutesPropsSchema.parse(input);
    this.briefings = props.briefings;
    this.ownerTimeZone = props.ownerTimeZone;
    this.settings = props.settings;
    this.person = new SignedInPerson({ identity: props.identity });
  }

  register(app: ZodFastifyInstance): void {
    app.get(
      '/briefings',
      {
        schema: {
          querystring: briefingsQuerySchema,
          response: { 200: briefingsSchema },
        },
      },
      async (request) =>
        this.read({
          userId: await this.signedIn(request),
          limit: request.query.limit,
        }),
    );
  }

  private async read(props: {
    userId: string;
    limit: number;
  }): Promise<Briefings> {
    const month = BudgetMonth.of({
      now: new Date(),
      timeZone: await this.ownerTimeZone.zone(),
    });
    if (this.settings === null) {
      return {
        configured: false,
        latest: null,
        lastRun: null,
        history: [],
        budget: { month: month.label, spentUsd: 0, capUsd: 0, reached: false },
      };
    }

    const [latest, lastRun, history, spentMicroUsd] = await Promise.all([
      this.briefings.latestSucceeded({ userId: props.userId }),
      this.briefings.latestRun({ userId: props.userId }),
      this.briefings.history(props),
      this.briefings.spentSince({ since: month.startsAt }),
    ]);
    const spentUsd = spentMicroUsd / microUsdPerUsd;
    const capUsd = this.settings.monthlyBudgetUsd;

    return {
      configured: true,
      latest,
      lastRun,
      history,
      budget: {
        month: month.label,
        spentUsd,
        capUsd,
        reached: spentUsd >= capUsd,
      },
    };
  }

  private async signedIn(request: FastifyRequest): Promise<string> {
    const userId = await this.person.of(request);
    if (userId === null) {
      throw new BriefingSignInRequiredError();
    }
    return userId;
  }
}
