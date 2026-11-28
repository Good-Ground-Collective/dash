import {
  prioritySchema,
  ticketActivityKindSchema,
  workItemStateSchema,
} from '@dash/integrations-core';
import { z } from 'zod';

const timestampSchema = z.iso.datetime({ offset: true });
const nodeIdSchema = z.string().min(1).max(200);

export const objectiveStatusSchema = z
  .enum(['active', 'parked', 'done'])
  .describe(
    '`done` follows the tracker (closed). `parked` is set in Dash, because trackers have no such state.',
  );

const fieldSourceSchema = z
  .enum(['tracker', 'dash'])
  .describe('`dash` when the tracker has no value and Dash’s own is shown.');

export const objectiveHintSchema = z
  .enum(['all_tickets_closed', 'all_epics_closed', 'no_recent_activity'])
  .describe(
    '`all_tickets_closed` and `all_epics_closed` ask whether to mark it done. `no_recent_activity`: nothing in 14 days.',
  );

export const objectiveProgressSchema = z.discriminatedUnion('source', [
  z
    .object({
      source: z.literal('tracker'),
      done: z.int().nonnegative(),
      total: z.int().positive(),
    })
    .describe('Closed tickets of an epic, or closed epics of an initiative.'),
  z
    .object({
      source: z.literal('manual'),
      percent: z.int().min(0).max(100),
    })
    .describe('Set in Dash, because nothing is linked.'),
  z.object({ source: z.literal('none') }),
]);

export const objectiveUpdateSchema = z.object({
  kind: ticketActivityKindSchema,
  occurredAt: timestampSchema,
  actor: z.string().min(1).nullable(),
  url: z.url(),
  ticket: z.object({ id: nodeIdSchema, title: z.string().min(1) }),
});

export const nextTicketSchema = z
  .object({
    id: nodeIdSchema,
    title: z.string().min(1),
    url: z.url(),
    priority: prioritySchema.nullable(),
  })
  .describe(
    'The open ticket with the highest priority, then the lowest sub-issue order.',
  );

export const epicTaskSchema = z.object({
  id: nodeIdSchema,
  title: z.string().min(1),
  url: z.url(),
  state: workItemStateSchema,
  assignees: z
    .array(z.string().min(1))
    .describe('Handles of the people it is assigned to, none when unassigned.'),
});

export const epicTasksSchema = z
  .object({
    items: z
      .array(epicTaskSchema)
      .describe(
        'Open tasks first, then closed, each in the epic’s order, at most 25. The epic’s URL lists the rest.',
      ),
    total: z.int().nonnegative().describe('How many tasks the epic has.'),
  })
  .describe('The epic’s tasks, so a person sees who has what.');

const objectiveSchema = z.object({
  id: nodeIdSchema.describe('The tracker’s id. Overlays are keyed on it.'),
  connectionId: z.uuid(),
  title: z.string().min(1),
  url: z.url(),
  status: objectiveStatusSchema,
  priority: z
    .object({ value: prioritySchema, source: fieldSourceSchema })
    .nullable(),
  dueDate: z
    .object({ value: z.iso.date(), source: fieldSourceSchema })
    .nullable(),
  progress: objectiveProgressSchema,
  lastActivityAt: timestampSchema,
  latestUpdate: objectiveUpdateSchema
    .nullable()
    .describe('The newest closing, merged pull request or comment.'),
  nextTicket: nextTicketSchema.nullable(),
  hints: z.array(objectiveHintSchema),
});

export const epicObjectiveSchema = objectiveSchema.extend({
  tasks: epicTasksSchema,
  dueAfterInitiative: z
    .boolean()
    .describe(
      'True when the epic is due after its initiative. Dash flags it and changes nothing.',
    ),
});

export const initiativeObjectiveSchema = objectiveSchema.extend({
  epics: z
    .array(epicObjectiveSchema)
    .describe('Ordered like initiatives, filtered by the same statuses.'),
});

export const objectivesConnectionSchema = z.object({
  id: z.uuid(),
  accountLogin: z.string().min(1),
  lastSyncedAt: timestampSchema.nullable(),
  lastError: z.string().nullable(),
  truncated: z
    .boolean()
    .nullable()
    .describe('True when the last good read hit a cap, so lists are partial.'),
});

/** `GET /objectives`: priority P1 first, then due date soonest first and none last. */
export const objectivesSchema = z.object({
  connections: z.array(objectivesConnectionSchema),
  initiatives: z.array(initiativeObjectiveSchema),
});

export const objectivesQuerySchema = z.object({
  status: z
    .string()
    .default('active')
    .transform((value) => [...new Set(value.split(','))])
    .pipe(z.array(objectiveStatusSchema).min(1))
    .describe('Comma-separated statuses to include, `active` by default.'),
});

export const overlayParamsSchema = z.object({ id: nodeIdSchema });

/** What Dash keeps beside the tracker. Null clears a value. Priority, due date and manual progress are refused while the tracker has its own. */
export const overlayChangesSchema = z
  .strictObject({
    parked: z.boolean().optional(),
    manualProgress: z.int().min(0).max(100).nullable().optional(),
    priority: prioritySchema.nullable().optional(),
    dueDate: z.iso.date().nullable().optional(),
  })
  .refine((changes) => Object.keys(changes).length > 0, {
    message:
      'Change at least one of parked, manualProgress, priority or dueDate',
  });

export const overlaySchema = z.object({
  id: nodeIdSchema,
  parked: z.boolean(),
  manualProgress: z.int().min(0).max(100).nullable(),
  priority: prioritySchema.nullable(),
  dueDate: z.iso.date().nullable(),
});

export type ObjectiveStatus = z.infer<typeof objectiveStatusSchema>;
export type ObjectiveHint = z.infer<typeof objectiveHintSchema>;
export type ObjectiveProgress = z.infer<typeof objectiveProgressSchema>;
export type ObjectiveUpdate = z.infer<typeof objectiveUpdateSchema>;
export type EpicTask = z.infer<typeof epicTaskSchema>;
export type EpicTasks = z.infer<typeof epicTasksSchema>;
export type NextTicket = z.infer<typeof nextTicketSchema>;
export type EpicObjective = z.infer<typeof epicObjectiveSchema>;
export type InitiativeObjective = z.infer<typeof initiativeObjectiveSchema>;
export type Objectives = z.infer<typeof objectivesSchema>;
export type OverlayChanges = z.infer<typeof overlayChangesSchema>;
export type Overlay = z.infer<typeof overlaySchema>;
