import {
  connectedAccountSchema,
  repositorySelectionSchema,
  providerIdSchema,
  repositorySchema,
} from '@dash/integrations-core';
import { z } from 'zod';

const timestampSchema = z.iso.datetime({ offset: true });

/** A path in the web app to send a person back to, such as `/setup/github`. Never another origin. */
export const returnToSchema = z
  .string()
  .regex(
    /^\/(?:[\w-]+(?:\/[\w-]+)*)?$/u,
    'Expected a path in the web app, such as /setup/github',
  );

/** An installation of a provider's app that Dash reads with the app's own credentials. */
export const ownedConnectionSchema = z.object({
  id: z.uuid(),
  provider: providerIdSchema,
  kind: z.literal('owned'),
  installationId: z.string().min(1),
  account: connectedAccountSchema,
  repositorySelection: repositorySelectionSchema,
  repositories: z.array(repositorySchema),
  suspended: z.boolean(),
  settingsUrl: z
    .url()
    .describe("The installation's settings on the provider: “Manage”."),
  connectedAt: timestampSchema,
  updatedAt: timestampSchema,
});

export type OwnedConnection = z.infer<typeof ownedConnectionSchema>;

export const connectQuerySchema = z.object({
  returnTo: returnToSchema
    .optional()
    .describe(
      'Where the provider’s callbacks send the person afterwards. Defaults to /setup/<provider>.',
    ),
});

export const connectStatusSchema = z.object({
  installUrl: z
    .url()
    .describe('Opens the provider’s install page. Valid for ten minutes.'),
  authorizeUrl: z
    .url()
    .describe('Links the provider account. Valid for ten minutes.'),
  account: connectedAccountSchema
    .nullable()
    .describe(
      'The provider account linked to you, or null before you authorize.',
    ),
  connections: z.array(ownedConnectionSchema),
});

export const setupQuerySchema = z.object({
  installation_id: z.string().min(1).max(64).optional(),
  setup_action: z.enum(['install', 'update', 'request']),
  state: z.string().min(1).optional(),
});

export const callbackQuerySchema = z.object({
  code: z.string().min(1).optional(),
  state: z.string().min(1).optional(),
  error: z.string().min(1).optional(),
  installation_id: z.string().min(1).max(64).optional(),
  setup_action: z.string().optional(),
});

export const webhookAcknowledgementSchema = z.object({
  deliveryId: z.string(),
  duplicate: z
    .boolean()
    .describe('True when this delivery id was already recorded.'),
});

export const connectOutcomeSchema = z.enum([
  'linked',
  'installed',
  'requested',
  'error',
]);

export const connectErrorReasonSchema = z.enum([
  'signed-out',
  'state',
  'denied',
  'not-yours',
  'linked-elsewhere',
  'provider',
]);

export type ConnectOutcome = z.infer<typeof connectOutcomeSchema>;
export type ConnectErrorReason = z.infer<typeof connectErrorReasonSchema>;
