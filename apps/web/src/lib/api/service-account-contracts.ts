import { z } from 'zod';

export const apiKeyScopeSchema = z.enum(['heartbeat:write', 'telemetry:write']);

export const serviceAccountKindSchema = z.enum(['bench', 'agent']);

export const apiKeySummarySchema = z.object({
  id: z.string(),
  start: z.string().nullable(),
  scopes: z.array(apiKeyScopeSchema),
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
