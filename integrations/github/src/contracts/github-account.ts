import type { AccountProfile, ConnectedAccount } from '@dash/integrations-core';
import { z } from 'zod';

const githubAccountObjectSchema = z.object({
  id: z.number(),
  login: z.string().min(1),
  type: z.string(),
  html_url: z.url(),
});

/** A user or organisation as the REST API returns it, read as a connected account. */
export const githubAccountSchema = githubAccountObjectSchema.transform(
  (account): ConnectedAccount => ({
    provider: 'github',
    externalId: String(account.id),
    url: account.html_url,
    login: account.login,
    kind: account.type === 'Organization' ? 'organization' : 'user',
  }),
);

/** Kept apart from `githubAccountSchema` because only the account list a person sees shows avatars; stored connections don't keep them. */
export const githubProfileSchema = githubAccountObjectSchema
  .extend({ avatar_url: z.url().nullable() })
  .transform((account): AccountProfile => ({
    ...githubAccountSchema.parse(account),
    avatarUrl: account.avatar_url,
  }));
