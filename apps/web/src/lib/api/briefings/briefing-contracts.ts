import { z } from 'zod';
import { linkSchema } from '#lib/api/github-account-contracts.ts';

const timestampSchema = z.coerce.date();

export const briefingStatusSchema = z
  .enum(['succeeded', 'failed', 'skipped_over_budget'])
  .describe(
    '`skipped_over_budget` runs never called the model and cost nothing. `failed` runs may still have cost tokens.',
  );

export const briefingStageSchema = z.enum(['snapshot', 'writing', 'saving']);

export const briefingCountsSchema = z
  .object({
    objectives: z.int().nonnegative(),
    reviewRequests: z.int().nonnegative(),
    myPullRequests: z.int().nonnegative(),
    failedRuns: z.int().nonnegative(),
    assignedIssues: z.int().nonnegative(),
    agents: z.int().nonnegative(),
    benches: z.int().nonnegative(),
  })
  .describe(
    'What each source held before trimming, initiatives and epics together for objectives.',
  );

export const briefingParagraphSchema = z
  .array(
    z.object({
      text: z.string(),
      href: linkSchema
        .nullable()
        .catch(null)
        .describe('A link that is not http or https is shown as plain text.'),
    }),
  )
  .describe('One paragraph as text segments, each optionally a link.');

export const briefingRunSchema = z.object({
  id: z.uuid(),
  trigger: z.enum(['scheduled', 'manual']),
  status: briefingStatusSchema,
  startedAt: timestampSchema,
  finishedAt: timestampSchema,
  snapshotAt: timestampSchema
    .nullable()
    .describe('When the data was read. Null for a run skipped over budget.'),
  model: z.string().nullable(),
  tokens: z.object({
    input: z.int().nonnegative(),
    cachedInput: z.int().nonnegative(),
    output: z.int().nonnegative(),
    reasoning: z.int().nonnegative(),
  }),
  costUsd: z.number().nonnegative(),
  prices: z
    .object({
      inputUsdPerMTok: z.number().nonnegative(),
      cachedInputUsdPerMTok: z.number().nonnegative(),
      outputUsdPerMTok: z.number().nonnegative(),
    })
    .nullable(),
  sourceCounts: briefingCountsSchema.nullable(),
  paragraphs: z.array(briefingParagraphSchema).nullable(),
  unknownRefs: z
    .int()
    .nonnegative()
    .describe('Citations in the writer’s text that named no item.'),
  error: z
    .string()
    .nullable()
    .describe('Why a failed or skipped run produced no briefing.'),
});

export const briefingBudgetSchema = z.object({
  month: z
    .string()
    .regex(/^\d{4}-\d{2}$/u)
    .describe('The budget month, YYYY-MM, in the owner’s time zone.'),
  spentUsd: z
    .number()
    .nonnegative()
    .describe('Spend of every person’s runs this month, failed runs included.'),
  capUsd: z.number().nonnegative(),
  runs: z
    .int()
    .nonnegative()
    .describe(
      'Runs started this month that called the model, failed runs included. Runs skipped over budget are not counted.',
    ),
  reached: z.boolean(),
});

export const briefingRunningSchema = z.object({
  runId: z.string().describe('The workflow id; the same id live events carry.'),
  startedAt: timestampSchema.describe('When the run was queued.'),
});

/** `GET /briefings` on Mission Control. */
export const briefingsSchema = z.object({
  configured: z.boolean(),
  latest: briefingRunSchema
    .nullable()
    .describe('The newest succeeded run, kept visible after a later failure.'),
  lastRun: briefingRunSchema
    .nullable()
    .describe('The newest run of any status.'),
  history: z.array(briefingRunSchema).describe('Newest first.'),
  budget: briefingBudgetSchema,
  running: briefingRunningSchema
    .nullable()
    .describe('This person’s run that is queued or in progress, if any.'),
});

/** What `POST /briefing/regenerate` answers with a 202. */
export const regenerateAcceptedSchema = z.object({
  runId: z
    .string()
    .describe(
      'The run started, or the run already queued or running for this person.',
    ),
});

export const briefingProgressEventSchema = z.object({
  runId: z.string(),
  stage: briefingStageSchema,
});

export const briefingReadyEventSchema = z.object({
  runId: z.string(),
  briefingId: z.uuid().describe('The stored run, whatever its status.'),
  status: briefingStatusSchema,
});

export type BriefingStatus = z.infer<typeof briefingStatusSchema>;
export type BriefingStage = z.infer<typeof briefingStageSchema>;
export type BriefingCounts = z.infer<typeof briefingCountsSchema>;
export type BriefingParagraph = z.infer<typeof briefingParagraphSchema>;
export type BriefingRecord = z.infer<typeof briefingRunSchema>;
export type BriefingBudget = z.infer<typeof briefingBudgetSchema>;
export type BriefingRunning = z.infer<typeof briefingRunningSchema>;
export type Briefings = z.infer<typeof briefingsSchema>;
export type RegenerateAccepted = z.infer<typeof regenerateAcceptedSchema>;
export type BriefingProgressEvent = z.infer<typeof briefingProgressEventSchema>;
export type BriefingReadyEvent = z.infer<typeof briefingReadyEventSchema>;
