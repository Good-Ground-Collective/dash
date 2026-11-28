import { z } from 'zod';
import { linkSchema } from '#lib/api/github-account-contracts.ts';

export const prioritySchema = z.enum(['P1', 'P2', 'P3']);

export const objectiveStatusSchema = z
  .enum(['active', 'parked', 'done'])
  .describe('`done` follows the tracker. `parked` is set in Dash.');

const fieldSourceSchema = z
  .enum(['tracker', 'dash'])
  .describe('`dash` when the tracker has no value and Dash’s own is shown.');

const dateSchema = z.iso.date();

export const objectiveHintSchema = z.enum([
  'all_tickets_closed',
  'all_epics_closed',
  'no_recent_activity',
]);

export const objectiveProgressSchema = z.discriminatedUnion('source', [
  z.object({
    source: z.literal('tracker'),
    done: z.number().int(),
    total: z.number().int(),
  }),
  z.object({ source: z.literal('manual'), percent: z.number().int() }),
  z.object({ source: z.literal('none') }),
]);

export const objectiveUpdateSchema = z.object({
  kind: z.enum(['ticket_closed', 'pull_request_merged', 'commented']),
  occurredAt: z.coerce.date(),
  actor: z.string().nullable(),
  url: linkSchema,
  ticket: z.object({ id: z.string(), title: z.string() }),
});

export const nextTicketSchema = z.object({
  id: z.string(),
  title: z.string(),
  url: linkSchema,
  priority: prioritySchema.nullable(),
});

export const epicTaskSchema = z.object({
  id: z.string(),
  title: z.string(),
  url: linkSchema,
  state: z.enum(['open', 'closed']),
  assignees: z.array(z.string()),
});

export const epicTasksSchema = z.object({
  items: z.array(epicTaskSchema),
  total: z.number().int(),
  urls: z.array(linkSchema).default([]),
});

const objectiveSchema = z.object({
  id: z.string(),
  connectionId: z.string(),
  title: z.string(),
  url: linkSchema,
  status: objectiveStatusSchema,
  priority: z
    .object({ value: prioritySchema, source: fieldSourceSchema })
    .nullable(),
  dueDate: z
    .object({ value: dateSchema, source: fieldSourceSchema })
    .nullable(),
  progress: objectiveProgressSchema,
  lastActivityAt: z.coerce.date(),
  latestUpdate: objectiveUpdateSchema.nullable(),
  nextTicket: nextTicketSchema.nullable(),
  hints: z.array(objectiveHintSchema),
});

export const epicObjectiveSchema = objectiveSchema.extend({
  tasks: epicTasksSchema,
  dueAfterInitiative: z.boolean(),
});

export const initiativeObjectiveSchema = objectiveSchema.extend({
  epics: z.array(epicObjectiveSchema),
});

export const objectivesConnectionSchema = z.object({
  id: z.string(),
  accountLogin: z.string(),
  lastSyncedAt: z.coerce.date().nullable(),
  lastError: z.string().nullable(),
  truncated: z.boolean().nullable(),
});

/** `GET /objectives` on Mission Control, already in home's order. */
export const objectivesSchema = z.object({
  connections: z.array(objectivesConnectionSchema),
  initiatives: z.array(initiativeObjectiveSchema),
});

/** The body of `PATCH /objectives/:id/overlay`. Null clears a value. */
export const overlayChangesSchema = z
  .strictObject({
    parked: z.boolean().optional(),
    manualProgress: z.number().int().min(0).max(100).nullable().optional(),
    priority: prioritySchema.nullable().optional(),
    dueDate: dateSchema.nullable().optional(),
  })
  .refine((changes) => Object.keys(changes).length > 0, {
    message:
      'Change at least one of parked, manualProgress, priority or dueDate',
  });

/** What `PATCH /objectives/:id/overlay` answers. */
export const overlaySchema = z.object({
  id: z.string(),
  parked: z.boolean(),
  manualProgress: z.number().int().nullable(),
  priority: prioritySchema.nullable(),
  dueDate: dateSchema.nullable(),
});

export type ObjectiveStatus = z.infer<typeof objectiveStatusSchema>;
export type ObjectiveHint = z.infer<typeof objectiveHintSchema>;
export type ObjectiveProgress = z.infer<typeof objectiveProgressSchema>;
export type EpicTask = z.infer<typeof epicTaskSchema>;
export type EpicObjective = z.infer<typeof epicObjectiveSchema>;
export type InitiativeObjective = z.infer<typeof initiativeObjectiveSchema>;
export type Objectives = z.infer<typeof objectivesSchema>;
export type OverlayChanges = z.input<typeof overlayChangesSchema>;
export type Overlay = z.infer<typeof overlaySchema>;
