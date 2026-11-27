import {
  connectedAccountSchema,
  repositorySelectionSchema,
  providerIdSchema,
  repositorySchema,
  userAccountSchema,
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

const installedStateSchema = z.object({
  state: z.literal('installed'),
  installationId: z.string().min(1),
  repositorySelection: repositorySelectionSchema,
  repositoryCount: z
    .int()
    .nonnegative()
    .nullable()
    .describe('Null while the installation is suspended.'),
  suspended: z.boolean(),
  settingsUrl: z
    .url()
    .describe(
      "The installation's settings on the provider, where the person changes which repositories it covers: “Manage”.",
    ),
  connectionId: z
    .uuid()
    .nullable()
    .describe(
      'The owned connection Dash recorded for it. Null when the app was installed without coming back through the setup URL.',
    ),
});

const requestedStateSchema = z.object({
  state: z.literal('requested'),
  requestedAt: timestampSchema,
});

const installableStateSchema = z.object({
  state: z.literal('installable'),
  installUrl: z
    .url()
    .describe(
      'Opens the provider’s install page with this account chosen. Valid for ten minutes.',
    ),
});

/** One account the person can connect, and where its install stands. */
export const connectableAccountSchema = z.object({
  account: userAccountSchema,
  install: z.discriminatedUnion('state', [
    installedStateSchema,
    requestedStateSchema,
    installableStateSchema,
  ]),
});

export const accountsResponseSchema = z.discriminatedUnion('status', [
  z.object({
    status: z
      .literal('authorize')
      .describe(
        'You haven’t authorized the provider’s app, or it no longer accepts your grant.',
      ),
    authorizeUrl: z
      .url()
      .describe('Links the provider account. Valid for ten minutes.'),
  }),
  z.object({
    status: z.literal('linked'),
    addAccountUrl: z
      .url()
      .describe(
        'Opens the provider’s own account picker, which lists every account you can install the app on or request it for. Valid for ten minutes.',
      ),
    accounts: z.array(connectableAccountSchema),
  }),
]);

export type InstalledState = z.infer<typeof installedStateSchema>;
export type RequestedState = z.infer<typeof requestedStateSchema>;
export type ConnectableAccount = z.infer<typeof connectableAccountSchema>;

export const setupQuerySchema = z
  .object({
    installation_id: z.string().min(1).max(64).optional(),
    setup_action: z.enum(['install', 'update', 'request']),
    state: z.string().min(1).optional(),
  })
  .transform((query) => ({
    installationId: query.installation_id,
    setupAction: query.setup_action,
    state: query.state,
  }));

export const callbackQuerySchema = z
  .object({
    code: z.string().min(1).optional(),
    state: z.string().min(1).optional(),
    error: z.string().min(1).optional(),
    installation_id: z.string().min(1).max(64).optional(),
    setup_action: z.string().optional(),
  })
  .transform((query) => ({
    code: query.code,
    state: query.state,
    error: query.error,
    installationId: query.installation_id,
    setupAction: query.setup_action,
  }));

export const webhookAcknowledgementSchema = z.object({
  deliveryId: z.string(),
  status: z
    .enum(['recorded', 'duplicate', 'ignored'])
    .describe(
      '`duplicate` when this delivery id was already recorded. `ignored` when the delivery concerns no installation Dash has a connection for, so nothing is stored.',
    ),
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
