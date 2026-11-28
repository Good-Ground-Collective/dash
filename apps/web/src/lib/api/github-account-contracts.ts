import { z } from 'zod';

/** A path in the web app for GitHub to send the person back to, such as `/setup/github`. Never another origin, and no query. */
export const returnToSchema = z
  .string()
  .regex(
    /^\/(?:[\w-]+(?:\/[\w-]+)*)?$/u,
    'Expected a path in the web app, such as /setup/github',
  );

/** A link the page opens. Only http(s), so a `javascript:` URL from a bad answer never becomes an href. */
export const linkSchema = z.url({ protocol: /^https?$/u });

export const accountRoleSchema = z
  .enum(['personal', 'owner', 'member'])
  .nullable()
  .describe('Null when GitHub won’t say.');

export const githubAccountSchema = z.object({
  externalId: z.string().min(1),
  login: z.string().min(1),
  kind: z.enum(['organization', 'user']),
  url: linkSchema,
  avatarUrl: linkSchema.nullable(),
  role: accountRoleSchema,
});

const installedStateSchema = z.object({
  state: z.literal('installed'),
  installationId: z.string().min(1),
  repositorySelection: z.enum(['all', 'selected']),
  repositoryCount: z
    .number()
    .int()
    .nonnegative()
    .nullable()
    .describe(
      'Null while suspended, where the person is not an owner, or when GitHub failed to give it.',
    ),
  suspended: z.boolean(),
  incomplete: z
    .boolean()
    .describe('GitHub failed to give the role or the repository count.'),
  settingsUrl: linkSchema.describe('“Manage”: where repositories are picked.'),
});

const installableStateSchema = z.object({
  state: z.literal('installable'),
  installUrl: linkSchema,
});

const requestableStateSchema = z.object({
  state: z.literal('requestable'),
  installUrl: linkSchema.describe(
    'GitHub’s install page for this organisation: a member asks its owners, an owner installs.',
  ),
});

const requestedStateSchema = z.object({
  state: z.literal('requested'),
  requestedAt: z.iso.datetime({ offset: true }),
});

export const connectableAccountSchema = z.object({
  account: githubAccountSchema,
  install: z.discriminatedUnion('state', [
    installedStateSchema,
    installableStateSchema,
    requestableStateSchema,
    requestedStateSchema,
  ]),
});

/** An organisation where the person’s membership is public, to look up by login. */
export const organizationSuggestionSchema = z.object({
  login: z.string().min(1),
  avatarUrl: linkSchema.nullable(),
});

/** An organisation login as the person types it: letters, digits, `-`, `_` and `.`. */
export const organizationLoginSchema = z
  .string()
  .trim()
  .min(1, 'Enter an organisation’s login, such as acme.')
  .max(100, 'That’s longer than any GitHub login.')
  .regex(/^[\w.-]+$/u, 'A GitHub login has only letters, digits and dashes.');

/** `GET /integrations/github/accounts`. The links carry signed state that expires after ten minutes. */
export const githubAccountsSchema = z.discriminatedUnion('status', [
  z.object({ status: z.literal('authorize'), authorizeUrl: linkSchema }),
  z.object({
    status: z.literal('linked'),
    addAccountUrl: linkSchema.describe(
      'GitHub’s own picker: every account the person can install on or request an install for.',
    ),
    accounts: z.array(connectableAccountSchema),
    suggestions: z
      .array(organizationSuggestionSchema)
      .default([])
      .describe(
        'Only organisations with a public membership: never every organisation the person belongs to.',
      ),
  }),
]);

/** `GET /integrations/github/accounts/lookup`. The entry is `requestable`, or `requested` when the person already asked. */
export const organizationLookupSchema = z.discriminatedUnion('status', [
  z.object({ status: z.literal('authorize'), authorizeUrl: linkSchema }),
  z.object({ status: z.literal('found'), entry: connectableAccountSchema }),
  z.object({ status: z.literal('missing') }),
]);

export type GithubAccount = z.infer<typeof githubAccountSchema>;
export type ConnectableAccount = z.infer<typeof connectableAccountSchema>;
export type InstalledState = z.infer<typeof installedStateSchema>;
export type GithubAccounts = z.infer<typeof githubAccountsSchema>;
export type OrganizationSuggestion = z.infer<
  typeof organizationSuggestionSchema
>;
export type OrganizationLookup = z.infer<typeof organizationLookupSchema>;
