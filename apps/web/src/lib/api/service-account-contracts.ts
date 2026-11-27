import { z } from 'zod';
import { reportedCharacterHueSchema } from '#lib/theme/character-hue.ts';

export const apiKeyScopeSchema = z.enum(['heartbeat:write', 'telemetry:write']);

/** Scopes as Mission Control reports them. Ones this build doesn't know yet are dropped, so a scope added there first doesn't break the page. */
export const reportedScopesSchema = z.array(z.string()).transform((values) =>
  values.flatMap((value) => {
    const known = apiKeyScopeSchema.safeParse(value);
    return known.success ? [known.data] : [];
  }),
);

export const serviceAccountKindSchema = z.enum(['bench', 'agent']);

export const apiKeySummarySchema = z.object({
  id: z.string(),
  start: z.string().nullable(),
  scopes: reportedScopesSchema,
  createdAt: z.coerce.date(),
  expiresAt: z.coerce.date().nullable(),
  lastUsedAt: z.coerce.date().nullable(),
});

export const serviceAccountSchema = z.object({
  id: z.string(),
  kind: serviceAccountKindSchema,
  name: z.string(),
  benchId: z.string().nullable(),
  agentName: z.string().nullable(),
  description: z.string(),
  hue: reportedCharacterHueSchema,
  scopes: reportedScopesSchema.describe(
    'Every key the account is issued gets these.',
  ),
  createdAt: z.coerce.date(),
  keys: z.array(apiKeySummarySchema),
});

export const serviceAccountListSchema = z.object({
  serviceAccounts: z.array(serviceAccountSchema),
});

export const issuedApiKeySchema = z.object({
  key: apiKeySummarySchema,
  secret: z.string().describe('Shown once: Mission Control keeps only a hash.'),
});

export const createdServiceAccountSchema = z.object({
  serviceAccount: serviceAccountSchema,
  apiKey: issuedApiKeySchema,
});

export const newServiceAccountSchema = z.discriminatedUnion('kind', [
  z.object({
    kind: z.literal('bench'),
    name: z.string(),
    description: z.string(),
    benchId: z.string(),
    scopes: z.array(apiKeyScopeSchema),
  }),
  z.object({
    kind: z.literal('agent'),
    name: z.string(),
    description: z.string(),
    agentName: z.string(),
    scopes: z.array(apiKeyScopeSchema),
  }),
]);

export type ApiKeyScope = z.infer<typeof apiKeyScopeSchema>;
export type ServiceAccountKind = z.infer<typeof serviceAccountKindSchema>;
export type ApiKeySummary = z.infer<typeof apiKeySummarySchema>;
export type ServiceAccount = z.infer<typeof serviceAccountSchema>;
export type IssuedApiKey = z.infer<typeof issuedApiKeySchema>;
export type CreatedServiceAccount = z.infer<typeof createdServiceAccountSchema>;
export type NewServiceAccount = z.infer<typeof newServiceAccountSchema>;
