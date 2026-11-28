import { DBOS } from '@dbos-inc/dbos-sdk';
import { z } from 'zod';

import type { BriefingSnapshotDigest } from '#src/briefing/contracts/briefing-snapshot.ts';
import {
  type BriefingProgressEvent,
  type BriefingReadyEvent,
  type BriefingRun,
  type BriefingRunning,
  briefingProgressEventSchema,
  briefingReadyEventSchema,
} from '#src/briefing/contracts/briefings.ts';
import {
  BriefingNotConfiguredError,
  BriefingNotRegisteredError,
  BriefingRunOutsideWorkflowError,
} from '#src/briefing/errors.ts';
import type { BriefingRepository } from '#src/briefing/repositories/briefings/briefing-repository.ts';
import type { OwnerTimeZoneReader } from '#src/briefing/repositories/owner-time-zones/owner-time-zone-reader.ts';
import type { PersonTimeZoneReader } from '#src/briefing/repositories/people-time-zones/person-time-zone-reader.ts';
import {
  BriefingRunRecords,
  type UnfinishedBriefingRun,
} from '#src/briefing/services/briefing-run-records/briefing-run-records.ts';
import { BriefingSchedule } from '#src/briefing/services/briefing-schedule/briefing-schedule.ts';
import { BriefingWriteAttempt } from '#src/briefing/services/briefing-write-attempt/briefing-write-attempt.ts';
import type { BriefingSnapshot } from '#src/briefing/services/briefing-snapshot/briefing-snapshot.ts';
import type { BriefingWriter } from '#src/briefing/services/briefing-writer/briefing-writer.ts';
import { BudgetMonth } from '#src/briefing/services/budget-month/budget-month.ts';
import type { LiveEvents } from '#src/live/services/live-events/live-events.ts';
import type { WorkflowModule } from '#src/platform/contracts/workflow-module.ts';
import type { BriefingSettings } from '#src/platform/definitions/config/app-config.ts';

const queueName = 'briefing';
const scheduleName = 'briefing-hourly';
const generateWorkflowName = 'briefingGenerate';
const microUsdPerUsd = 1_000_000;

const writeStepOptions = {
  name: 'briefingWrite',
  retriesAllowed: true,
  maxAttempts: 2,
  intervalSeconds: 2,
  backoffRate: 2,
};

const generateInputSchema = z.tuple([z.string(), z.string()]);

const briefingGenerationPropsSchema = z.object({
  settings: z.custom<Pick<BriefingSettings, 'monthlyBudgetUsd' | 'prices'>>(),
  writer: z.custom<BriefingWriter>(),
});

const briefingWorkflowsPropsSchema = z.object({
  briefings: z.custom<BriefingRepository>(),
  ownerTimeZone: z.custom<OwnerTimeZoneReader>(),
  people: z.custom<PersonTimeZoneReader>(),
  snapshot: z.custom<BriefingSnapshot>(),
  liveEvents: z.custom<LiveEvents>(),
  generation: briefingGenerationPropsSchema.nullable(),
});

type Generation = z.output<typeof briefingGenerationPropsSchema>;
type Trigger = BriefingRun['trigger'];
type GenerateWorkflow = (userId: string, trigger: Trigger) => Promise<void>;
type ScheduledWorkflow = (firedAt: Date) => Promise<void>;

export interface BriefingWorkflows extends WorkflowModule {
  /** Queues a run for the person, or returns the run already queued or running for them. */
  regenerate(props: {
    userId: string;
    trigger: Trigger;
  }): Promise<{ runId: string }>;
  /** The person's newest run that is queued or in progress. */
  running(props: { userId: string }): Promise<BriefingRunning | null>;
}

/**
 * Durable briefing runs. One queue takes a run at a time, whoever it is for, and a person
 * with a run queued or in progress is never given a second: a scheduled tick or a press of
 * Regenerate joins the run that is already there. The hourly schedule queues a run for each
 * person whose own clock reads one of the briefing hours. Without a configured writer
 * nothing is scheduled.
 */
export class DbosBriefingWorkflows implements BriefingWorkflows {
  private readonly briefings: BriefingRepository;
  private readonly ownerTimeZone: OwnerTimeZoneReader;
  private readonly people: PersonTimeZoneReader;
  private readonly snapshot: BriefingSnapshot;
  private readonly liveEvents: LiveEvents;
  private readonly generation: Generation | null;
  private registered: {
    generate: GenerateWorkflow;
    scheduled: ScheduledWorkflow;
  } | null = null;

  constructor(props: z.input<typeof briefingWorkflowsPropsSchema>) {
    const parsed = briefingWorkflowsPropsSchema.parse(props);
    this.briefings = parsed.briefings;
    this.ownerTimeZone = parsed.ownerTimeZone;
    this.people = parsed.people;
    this.snapshot = parsed.snapshot;
    this.liveEvents = parsed.liveEvents;
    this.generation = parsed.generation;
  }

  async activate(): Promise<void> {
    if (this.registered === null) {
      throw new BriefingNotRegisteredError();
    }
    await DBOS.registerQueue(queueName, {
      workerConcurrency: 1,
      globalConcurrency: 1,
    });

    if (this.generation !== null) {
      await DBOS.applySchedules([
        {
          scheduleName,
          workflowFn: this.registered.scheduled,
          schedule: '0 0 * * * *',
        },
      ]);
    } else if ((await DBOS.getSchedule(scheduleName)) !== null) {
      await DBOS.deleteSchedule(scheduleName);
    }
  }

  async regenerate(props: {
    userId: string;
    trigger: Trigger;
  }): Promise<{ runId: string }> {
    if (this.generation === null) {
      throw new BriefingNotConfiguredError();
    }
    if (this.registered === null) {
      throw new BriefingNotRegisteredError();
    }
    const handle = await DBOS.startWorkflow(this.registered.generate, {
      queueName,
      enqueueOptions: { deduplicationID: `briefing-${props.userId}` },
      duplicationPolicy: 'return-existing',
    })(props.userId, props.trigger);
    return { runId: handle.workflowID };
  }

  async running(props: { userId: string }): Promise<BriefingRunning | null> {
    const unfinished = await DBOS.listWorkflows({
      workflowName: generateWorkflowName,
      status: ['ENQUEUED', 'PENDING'],
      loadInput: true,
      sortDesc: true,
    });
    const own = unfinished.find(
      (run) =>
        generateInputSchema.safeParse(run.input).data?.[0] === props.userId,
    );
    return own === undefined
      ? null
      : {
          runId: own.workflowID,
          startedAt: new Date(own.createdAt).toISOString(),
        };
  }

  registerWorkflows(): void {
    this.registered = {
      generate: DBOS.registerWorkflow(
        async (userId: string, trigger: Trigger) =>
          this.generateFor({ userId, trigger }),
        { name: generateWorkflowName },
      ),
      scheduled: DBOS.registerWorkflow(
        async (firedAt: Date) => this.enqueueDue({ firedAt }),
        { name: 'briefingScheduled' },
      ),
    };
  }

  private async enqueueDue(props: { firedAt: Date }): Promise<void> {
    const people = await DBOS.runStep(() => this.people.people(), {
      name: 'briefingPeople',
    });
    for (const { userId, timeZone } of people) {
      if (BriefingSchedule.isBriefingHour({ ...props, timeZone })) {
        await this.regenerate({ userId, trigger: 'scheduled' });
      }
    }
  }

  private async generateFor(props: {
    userId: string;
    trigger: Trigger;
  }): Promise<void> {
    const generation = this.generation;
    if (generation === null) {
      throw new BriefingNotConfiguredError();
    }
    const runId = DBOS.workflowID;
    if (runId === undefined) {
      throw new BriefingRunOutsideWorkflowError();
    }
    const startedAt = new Date(await DBOS.now());

    const spentMicroUsd = await this.spentThisMonth(startedAt);
    this.progress({ runId, stage: 'snapshot' });
    const snapshot = await this.takeSnapshot({
      userId: props.userId,
      now: startedAt,
    });

    const capMicroUsd = Math.round(
      generation.settings.monthlyBudgetUsd * microUsdPerUsd,
    );
    if (
      spentMicroUsd +
        BriefingWriteAttempt.worstCaseCostMicroUsd({
          writer: generation.writer,
          snapshot,
          attempts: writeStepOptions.maxAttempts,
        }) >
      capMicroUsd
    ) {
      await this.save({
        runId,
        run: BriefingRunRecords.skippedOverBudget({ ...props, startedAt }),
      });
      return;
    }

    this.progress({ runId, stage: 'writing' });
    const outcome = await BriefingWriteAttempt.durably({
      writer: generation.writer,
      snapshot,
      step: writeStepOptions,
    });
    this.progress({ runId, stage: 'saving' });
    await this.save({
      runId,
      run: BriefingRunRecords.written({
        ...props,
        startedAt,
        snapshot,
        outcome,
        prices: generation.settings.prices,
      }),
    });
  }

  private async spentThisMonth(startedAt: Date): Promise<number> {
    return DBOS.runStep(
      async () =>
        this.briefings.spentSince({
          since: BudgetMonth.of({
            now: startedAt,
            timeZone: await this.ownerTimeZone.zone(),
          }).startsAt,
        }),
      { name: 'briefingBudget' },
    );
  }

  /** Takes the full snapshot of the person's data, counting what changed from when their previous successful briefing read its data. */
  private async takeSnapshot(props: {
    userId: string;
    now: Date;
  }): Promise<BriefingSnapshotDigest> {
    const readAt = await DBOS.runStep(
      async () => {
        const previous = await this.briefings.latestSucceeded({
          userId: props.userId,
        });
        return previous?.snapshotAt ?? previous?.startedAt ?? null;
      },
      { name: 'briefingPrevious' },
    );
    const previousBriefingAt = readAt === null ? null : new Date(readAt);

    return DBOS.runStep(
      () => this.snapshot.of({ ...props, previousBriefingAt }),
      { name: 'briefingSnapshot' },
    );
  }

  private async save(props: {
    runId: string;
    run: UnfinishedBriefingRun;
  }): Promise<void> {
    const finishedAt = new Date(await DBOS.now());
    const recorded = await DBOS.runStep(
      () => this.briefings.record({ ...props.run, finishedAt }),
      { name: 'briefingRecord' },
    );
    this.ready({
      runId: props.runId,
      briefingId: recorded.id,
      status: recorded.status,
    });
  }

  private progress(event: BriefingProgressEvent): void {
    this.liveEvents.publish({
      type: 'briefing.progress',
      data: briefingProgressEventSchema.parse(event),
    });
  }

  private ready(event: BriefingReadyEvent): void {
    this.liveEvents.publish({
      type: 'briefing.ready',
      data: briefingReadyEventSchema.parse(event),
    });
  }
}
