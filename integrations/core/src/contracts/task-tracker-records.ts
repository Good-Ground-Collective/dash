import { z } from 'zod';

import {
  epicSchema,
  initiativeSchema,
  ticketSchema,
} from '#src/contracts/work-item.ts';

export const trackerQuerySchema = z.object({
  installationId: z.string().min(1),
  account: z.object({
    login: z
      .string()
      .min(1)
      .describe('The account handle as the provider shows it.'),
    kind: z.enum(['organization', 'user']),
  }),
});

export const ticketActivityKindSchema = z.enum([
  'ticket_closed',
  'pull_request_merged',
  'commented',
]);

/** Something that happened on a ticket, for an epic's latest update. Providers report at most the newest of each kind. */
export const ticketActivitySchema = z.object({
  ticketId: z.string().min(1),
  kind: ticketActivityKindSchema,
  occurredAt: z.iso.datetime({ offset: true }),
  actor: z
    .string()
    .min(1)
    .nullable()
    .describe('Who did it, when the provider says.'),
  url: z.url().describe('Opens the comment, pull request or ticket.'),
});

/** What one installation's tracker shows. Every list is capped, so a large tracker reads in a bounded number of calls. */
export const trackerSnapshotSchema = z.object({
  initiatives: z.array(initiativeSchema),
  epics: z
    .array(epicSchema)
    .describe('Epics inside the initiatives read, each listed once.'),
  tickets: z.array(ticketSchema).describe('The tickets of the epics read.'),
  activity: z.array(ticketActivitySchema),
  truncated: z.boolean().describe('True when a cap cut a list short.'),
});

export type TrackerQuery = z.infer<typeof trackerQuerySchema>;
export type TicketActivityKind = z.infer<typeof ticketActivityKindSchema>;
export type TicketActivity = z.infer<typeof ticketActivitySchema>;
export type TrackerSnapshot = z.infer<typeof trackerSnapshotSchema>;
