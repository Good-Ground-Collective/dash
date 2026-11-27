import { z } from 'zod';

import { externalRecordSchema } from '#src/contracts/external-record.ts';

export const workItemStateSchema = z.enum(['open', 'closed']);

export const prioritySchema = z.enum(['P1', 'P2', 'P3']);

const trackedItemSchema = externalRecordSchema.extend({
  title: z.string().min(1),
  state: workItemStateSchema,
  priority: prioritySchema
    .nullable()
    .describe('Null when the tracker has no priority for the item.'),
  dueDate: z.iso
    .date()
    .nullable()
    .describe('Null when the tracker has no due date for the item.'),
  lastActivityAt: z.iso
    .datetime({ offset: true })
    .describe('The most recent change to the item or its comments.'),
});

export const initiativeSchema = trackedItemSchema.extend({
  level: z.literal('initiative'),
});

export const epicSchema = trackedItemSchema.extend({
  level: z.literal('epic'),
  initiativeIds: z
    .array(z.string().min(1))
    .describe(
      'External IDs of the initiatives the epic sits in. A tracker may place one epic in several.',
    ),
});

export const ticketSchema = trackedItemSchema.extend({
  level: z.literal('ticket'),
  epicId: z
    .string()
    .min(1)
    .nullable()
    .describe(
      'External ID of the parent epic. Null when the ticket has no epic.',
    ),
});

export const workItemSchema = z.discriminatedUnion('level', [
  initiativeSchema,
  epicSchema,
  ticketSchema,
]);

export type WorkItemState = z.infer<typeof workItemStateSchema>;
export type Priority = z.infer<typeof prioritySchema>;
export type Initiative = z.infer<typeof initiativeSchema>;
export type Epic = z.infer<typeof epicSchema>;
export type Ticket = z.infer<typeof ticketSchema>;
export type WorkItem = z.infer<typeof workItemSchema>;
