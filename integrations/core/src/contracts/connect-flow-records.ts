import { z } from 'zod';

import { externalRecordSchema } from '#src/contracts/external-record.ts';
import { repositorySchema } from '#src/contracts/source-control-records.ts';

const timestampSchema = z.iso.datetime({ offset: true });

/** A personal account or an organisation on the provider. */
export const connectedAccountSchema = externalRecordSchema.extend({
  login: z
    .string()
    .min(1)
    .describe('The account handle as the provider shows it.'),
  kind: z.enum(['organization', 'user']),
});

export const repositorySelectionSchema = z
  .enum(['all', 'selected'])
  .describe(
    '`all` follows every repository the account has, now and later. `selected` covers only the chosen ones.',
  );

/** The app installed on one account. Its `url` opens the installation's settings on the provider. */
export const installationSchema = externalRecordSchema.extend({
  account: connectedAccountSchema,
  repositorySelection: repositorySelectionSchema,
  repositories: z.array(repositorySchema),
  suspended: z.boolean(),
});

export const accountProfileSchema = connectedAccountSchema.extend({
  avatarUrl: z.url().nullable(),
});

export const accountRoleSchema = z
  .enum(['personal', 'owner', 'member'])
  .describe(
    '`personal` is the person’s own account. `owner` and `member` are their role in an organisation.',
  );

/** An account as one person sees it. */
export const userAccountSchema = accountProfileSchema.extend({
  role: accountRoleSchema
    .nullable()
    .describe('Null when the provider won’t say.'),
});

/** The app installed on an account the person can see. Its `url` opens the installation's settings on the provider. */
export const userInstallationSchema = externalRecordSchema.extend({
  account: userAccountSchema,
  repositorySelection: repositorySelectionSchema,
  repositoryCount: z
    .int()
    .nonnegative()
    .nullable()
    .describe(
      'How many repositories the installation covers, private ones included. Null while it is suspended, where the person is not an owner, or when it could not be read.',
    ),
  suspended: z.boolean(),
  incomplete: z
    .boolean()
    .describe(
      'True when the provider failed to give the role or the repository count, as when it rate-limits the request. Those fields are then null, and reading again may fill them.',
    ),
});

/**
 * What a person's token shows: their own account and the installations of the app they can
 * see. A provider may hide accounts where the app isn't installed, as GitHub does.
 */
export const userAccountsSchema = z.object({
  personal: userAccountSchema,
  installations: z.array(userInstallationSchema),
});

/** A person's token for acting as themselves through the app. */
export const userGrantSchema = z.object({
  accessToken: z.string().min(1),
  accessTokenExpiresAt: timestampSchema
    .nullable()
    .describe('Null when the token does not expire.'),
  refreshToken: z.string().min(1).nullable(),
  refreshTokenExpiresAt: timestampSchema.nullable(),
});

export const authorizedUserSchema = z.object({
  account: connectedAccountSchema,
  grant: userGrantSchema,
});

/** A webhook delivery whose signature checked out. */
export const webhookDeliverySchema = z.object({
  deliveryId: z
    .string()
    .min(1)
    .describe(
      'Unique per delivery and kept on redelivery, so it keys idempotency.',
    ),
  event: z.string().min(1),
  installationId: z
    .string()
    .min(1)
    .nullable()
    .describe('Null for events that concern no installation.'),
  installationLifecycle: z
    .boolean()
    .describe(
      'True when the event is about the installation itself, such as its creation or a change to its repositories. These can arrive before Dash has recorded the installation.',
    ),
});

/** Request headers as Node and Fastify hand them over. */
export type WebhookHeaders = Readonly<
  Record<string, string | readonly string[] | undefined>
>;

export type ConnectedAccount = z.infer<typeof connectedAccountSchema>;
export type Installation = z.infer<typeof installationSchema>;
export type AccountProfile = z.infer<typeof accountProfileSchema>;
export type AccountRole = z.infer<typeof accountRoleSchema>;
export type UserAccount = z.infer<typeof userAccountSchema>;
export type UserInstallation = z.infer<typeof userInstallationSchema>;
export type UserAccounts = z.infer<typeof userAccountsSchema>;
export type UserGrant = z.infer<typeof userGrantSchema>;
export type AuthorizedUser = z.infer<typeof authorizedUserSchema>;
export type WebhookDelivery = z.infer<typeof webhookDeliverySchema>;
