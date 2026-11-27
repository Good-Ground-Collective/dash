import type { ConnectedAccount } from '@dash/integrations-core';
import { z } from 'zod';

/** A user or organisation as the REST API returns it, read as a connected account. */
export const githubAccountSchema = z
  .object({
    id: z.number(),
    login: z.string().min(1),
    type: z.string(),
    html_url: z.url(),
  })
  .transform((account): ConnectedAccount => ({
    provider: 'github',
    externalId: String(account.id),
    url: account.html_url,
    login: account.login,
    kind: account.type === 'Organization' ? 'organization' : 'user',
  }));
