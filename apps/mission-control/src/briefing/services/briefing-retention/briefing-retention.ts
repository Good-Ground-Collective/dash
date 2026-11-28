import { DBOS } from '@dbos-inc/dbos-sdk';
import { z } from 'zod';

import { BriefingNotRegisteredError } from '#src/briefing/errors.ts';
import type { BriefingRepository } from '#src/briefing/repositories/briefings/briefing-repository.ts';
import type { OwnerTimeZoneReader } from '#src/briefing/repositories/owner-time-zones/owner-time-zone-reader.ts';
import { BudgetMonth } from '#src/briefing/services/budget-month/budget-month.ts';
import type { WorkflowModule } from '#src/platform/contracts/workflow-module.ts';

const retentionScheduleName = 'briefing-retention-daily';
const retentionMilliseconds = 30 * 24 * 60 * 60 * 1000;

const briefingRetentionPropsSchema = z.object({
  briefings: z.custom<BriefingRepository>(),
  ownerTimeZone: z.custom<OwnerTimeZoneReader>(),
});

type ScheduledWorkflow = (firedAt: Date) => Promise<void>;

/** Briefing runs are kept for 30 days, but never past the start of the budget month, so pruning can't lower the month's spend. */
export interface BriefingRetention {
  /** Deletes runs older than the earlier of 30 days before `now` and the start of the current budget month, and says how many went. */
  prune(props: { now: Date }): Promise<number>;
}

/** Prunes once a day, at 04:00 UTC. */
export class DbosBriefingRetention
  implements BriefingRetention, WorkflowModule
{
  private readonly briefings: BriefingRepository;
  private readonly ownerTimeZone: OwnerTimeZoneReader;
  private scheduled: ScheduledWorkflow | null = null;

  constructor(props: z.input<typeof briefingRetentionPropsSchema>) {
    const parsed = briefingRetentionPropsSchema.parse(props);
    this.briefings = parsed.briefings;
    this.ownerTimeZone = parsed.ownerTimeZone;
  }

  async prune(props: { now: Date }): Promise<number> {
    const { startsAt } = BudgetMonth.of({
      now: props.now,
      timeZone: await this.ownerTimeZone.zone(),
    });
    const thirtyDaysAgo = new Date(props.now.getTime() - retentionMilliseconds);

    return this.briefings.deleteStartedBefore({
      cutoff: startsAt < thirtyDaysAgo ? startsAt : thirtyDaysAgo,
    });
  }

  async activate(): Promise<void> {
    if (this.scheduled === null) {
      throw new BriefingNotRegisteredError();
    }
    await DBOS.applySchedules([
      {
        scheduleName: retentionScheduleName,
        workflowFn: this.scheduled,
        schedule: '0 0 4 * * *',
      },
    ]);
  }

  registerWorkflows(): void {
    this.scheduled = DBOS.registerWorkflow(
      async (firedAt: Date) => {
        const pruned = await DBOS.runStep(() => this.prune({ now: firedAt }), {
          name: 'briefingPrune',
        });
        if (pruned > 0) {
          DBOS.logger.info(`Deleted ${pruned} briefing runs`);
        }
      },
      { name: 'briefingRetention' },
    );
  }
}
