import {
  prioritySchema,
  ticketActivityKindSchema,
  workItemStateSchema,
} from '@dash/integrations-core';
import { z } from 'zod';

const nodeIdSchema = z
  .string()
  .min(1)
  .describe('The tracker’s own id, stable across renames and moves.');
const timestampSchema = z.iso.datetime({ offset: true });

const trackedRecordSchema = z.object({
  nodeId: nodeIdSchema,
  title: z.string().min(1),
  url: z.url(),
  state: workItemStateSchema,
  priority: prioritySchema.nullable(),
  lastActivityAt: timestampSchema,
});

export const initiativeRecordSchema = trackedRecordSchema.extend({
  dueDate: z.iso.date().nullable(),
});

export const epicRecordSchema = trackedRecordSchema.extend({
  dueDate: z.iso.date().nullable(),
});

/** An epic inside an initiative. One epic can sit in several. */
export const placementRecordSchema = z.object({
  initiativeNodeId: nodeIdSchema,
  epicNodeId: nodeIdSchema,
});

export const ticketRecordSchema = trackedRecordSchema.extend({
  epicNodeId: nodeIdSchema,
  position: z.int().nonnegative(),
  assignees: z.array(z.string().min(1)),
});

export const activityRecordSchema = z.object({
  ticketNodeId: nodeIdSchema,
  kind: ticketActivityKindSchema,
  occurredAt: timestampSchema,
  actor: z.string().min(1).nullable(),
  url: z.url(),
});

/** Everything one read of a connection's tracker found, in the shape of its tables. A later read replaces it whole. */
export const objectiveRecordsSchema = z.object({
  initiatives: z.array(initiativeRecordSchema),
  epics: z.array(epicRecordSchema),
  placements: z.array(placementRecordSchema),
  tickets: z.array(ticketRecordSchema),
  activity: z.array(activityRecordSchema),
});

/** An owned connection as the reconcile reads it, through its provider's task tracker. */
export interface ObjectiveSyncTarget {
  connectionId: string;
  provider: string;
  installationId: string | null;
  account: { login: string; kind: 'organization' | 'user' };
  connectedBy: string | null;
  suspended: boolean;
}

export type InitiativeRecord = z.infer<typeof initiativeRecordSchema>;
export type EpicRecord = z.infer<typeof epicRecordSchema>;
export type PlacementRecord = z.infer<typeof placementRecordSchema>;
export type TicketRecord = z.infer<typeof ticketRecordSchema>;
export type ActivityRecord = z.infer<typeof activityRecordSchema>;
export type ObjectiveRecords = z.infer<typeof objectiveRecordsSchema>;
