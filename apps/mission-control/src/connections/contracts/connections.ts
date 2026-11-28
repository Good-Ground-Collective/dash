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
    .describe(
      'Private repositories included. Null while the installation is suspended, where you are not an owner, or when it could not be read.',
    ),
  suspended: z.boolean(),
  incomplete: z
    .boolean()
    .describe(
      'True when the provider failed to give your role or the repository count, as when it rate-limits the request. Those fields are then null, and loading again may fill them.',
    ),
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

const installableStateSchema = z.object({
  state: z.literal('installable'),
  installUrl: z
    .url()
    .describe(
      'Opens the provider’s install page with this account chosen. Valid for ten minutes.',
    ),
});

const requestableStateSchema = z.object({
  state: z.literal('requestable'),
  installUrl: z
    .url()
    .describe(
      'Opens the provider’s install page for this organisation, where a member asks its owners to install the app and an owner installs it. Valid for ten minutes.',
    ),
});

const requestedStateSchema = z.object({
  state: z.literal('requested'),
  requestedAt: timestampSchema.describe(
    'When you last asked its owners to install the app. The request clears once the installation appears to you.',
  ),
});

/** One account the person can connect, and where its install stands. */
export const connectableAccountSchema = z.object({
  account: userAccountSchema,
  install: z.discriminatedUnion('state', [
    installedStateSchema,
    installableStateSchema,
    requestableStateSchema,
    requestedStateSchema,
  ]),
});

/** An organisation where the person made their membership public. */
export const organizationSuggestionSchema = z.object({
  login: z.string().min(1),
  avatarUrl: z.url().nullable(),
});

/** An account login as GitHub allows them: up to 39 letters and digits, with single dashes between them. */
export const accountLoginSchema = z
  .string()
  .trim()
  .min(1, 'Enter an organisation’s login, such as acme.')
  .max(39, 'That’s longer than any GitHub login.')
  .regex(
    /^[a-z\d](?:-?[a-z\d])*$/iu,
    'A GitHub login has only letters, digits and single dashes, and doesn’t start or end with a dash.',
  );

export const organizationLookupQuerySchema = connectQuerySchema.extend({
  login: accountLoginSchema.describe('The organisation’s login, such as acme.'),
});

const authorizeResponseSchema = z.object({
  status: z
    .literal('authorize')
    .describe(
      'You haven’t authorized the provider’s app, or it no longer accepts your grant.',
    ),
  authorizeUrl: z
    .url()
    .describe('Links the provider account. Valid for ten minutes.'),
});

export const organizationLookupResponseSchema = z.discriminatedUnion('status', [
  authorizeResponseSchema,
  z.object({
    status: z.literal('found'),
    entry: connectableAccountSchema.describe(
      'The organisation, `requestable`, or `requested` when you already asked. The role is null: the provider says it only once the app is installed. An organisation that already has the app reads as `requestable` here; the account list shows it as installed.',
    ),
  }),
  z.object({
    status: z
      .literal('missing')
      .describe('No organisation on the provider has that login.'),
  }),
]);

export const accountsResponseSchema = z.discriminatedUnion('status', [
  authorizeResponseSchema,
  z.object({
    status: z.literal('linked'),
    addAccountUrl: z
      .url()
      .describe(
        'Opens the provider’s own account picker, which lists every account you can install the app on or request it for. A request made there isn’t listed: the provider doesn’t say which account it was for, so the account appears once an owner installs. Valid for ten minutes.',
      ),
    accounts: z
      .array(connectableAccountSchema)
      .describe(
        'Your personal account, the installations you can see, and the organisations you asked to install the app through a link from Dash.',
      ),
    suggestions: z
      .array(organizationSuggestionSchema)
      .describe(
        'Organisations where your membership is public and that aren’t listed, to look up by login. Never every organisation you belong to: the provider’s app can’t list those. Empty when the provider fails to give them.',
      ),
  }),
]);

export type InstalledState = z.infer<typeof installedStateSchema>;
export type RequestedState = z.infer<typeof requestedStateSchema>;
export type ConnectableAccount = z.infer<typeof connectableAccountSchema>;
export type OrganizationSuggestion = z.infer<
  typeof organizationSuggestionSchema
>;

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
  'request-unrecorded',
  'denied',
  'not-yours',
  'linked-elsewhere',
  'provider',
]);

export type ConnectOutcome = z.infer<typeof connectOutcomeSchema>;
export type ConnectErrorReason = z.infer<typeof connectErrorReasonSchema>;
