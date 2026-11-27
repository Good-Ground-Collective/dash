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

export const connectableAccountSchema = z.object({
  account: githubAccountSchema,
  install: z.discriminatedUnion('state', [
    installedStateSchema,
    installableStateSchema,
  ]),
});

/** `GET /integrations/github/accounts`. The links carry signed state that expires after ten minutes. */
export const githubAccountsSchema = z.discriminatedUnion('status', [
  z.object({ status: z.literal('authorize'), authorizeUrl: linkSchema }),
  z.object({
    status: z.literal('linked'),
    addAccountUrl: linkSchema.describe(
      'GitHub’s own picker: every account the person can install on or request an install for.',
    ),
    accounts: z.array(connectableAccountSchema),
  }),
]);

export type GithubAccount = z.infer<typeof githubAccountSchema>;
export type ConnectableAccount = z.infer<typeof connectableAccountSchema>;
export type InstalledState = z.infer<typeof installedStateSchema>;
export type GithubAccounts = z.infer<typeof githubAccountsSchema>;
