import { z } from 'zod';

import { apiKeyScopeSchema } from '#src/auth/definitions/api-key-scopes/api-key-scopes.ts';

/** A bench id or agent name: it appears in URLs, so it is a slug. */
export const agentIdentifierSchema = z
  .string()
  .trim()
  .min(1)
  .max(100)
  .regex(/^[\w.-]+$/u, 'Use letters, digits, dots, dashes and underscores')
  .refine(
    (value) => !/^\.+$/u.test(value),
    'Dots alone would be read as a path segment: add a letter, digit, dash or underscore',
  );

export const serviceAccountKindSchema = z
  .enum(['bench', 'agent'])
  .describe(
    'A `bench` account is one machine and may report for any agent on it. An `agent` account runs away from a bench and may report only as itself.',
  );

export type ServiceAccountKind = z.infer<typeof serviceAccountKindSchema>;

const scopesSchema = z
  .array(apiKeyScopeSchema)
  .min(1)
  .transform((scopes) => [...new Set(scopes)]);

const accountDetailsSchema = z.object({
  name: z.string().trim().min(1).max(100),
  description: z.string().trim().min(1).max(500),
  scopes: scopesSchema.describe(
    'What the account’s keys may do, now and when rotated.',
  ),
});

export const newServiceAccountSchema = z.discriminatedUnion('kind', [
  accountDetailsSchema.extend({
    kind: z.literal('bench'),
    benchId: agentIdentifierSchema,
  }),
  accountDetailsSchema.extend({
    kind: z.literal('agent'),
    agentName: agentIdentifierSchema,
  }),
]);

export type NewServiceAccount = z.input<typeof newServiceAccountSchema>;

export const newApiKeySchema = z.object({ serviceAccountId: z.uuid() });

export type NewApiKey = z.input<typeof newApiKeySchema>;

export const serviceAccountRefSchema = z.object({
  serviceAccountId: z.uuid(),
});

export const apiKeyRefSchema = z.object({ keyId: z.string().min(1) });

export const apiKeySummarySchema = z.object({
  id: z.string(),
  start: z
    .string()
    .nullable()
    .describe('The prefix and first characters, to recognise the key by.'),
  scopes: z.array(apiKeyScopeSchema),
  createdAt: z.iso.datetime({ offset: true }),
  expiresAt: z.iso
    .datetime({ offset: true })
    .nullable()
    .describe('`null` for bench keys, which never expire.'),
  lastUsedAt: z.iso.datetime({ offset: true }).nullable(),
});

export type ApiKeySummary = z.infer<typeof apiKeySummarySchema>;

export const issuedApiKeySchema = z.object({
  key: apiKeySummarySchema,
  secret: z
    .string()
    .describe(
      'The whole key. Only its hash is stored, so this is the one time it is shown.',
    ),
});

export type IssuedApiKey = z.infer<typeof issuedApiKeySchema>;

export const serviceAccountSchema = z.object({
  id: z.uuid(),
  kind: serviceAccountKindSchema,
  name: z.string(),
  benchId: z.string().nullable(),
  agentName: z.string().nullable(),
  description: z.string(),
  scopes: z.array(apiKeyScopeSchema),
  createdAt: z.iso.datetime({ offset: true }),
  keys: z.array(apiKeySummarySchema),
});

export type ServiceAccount = z.infer<typeof serviceAccountSchema>;

export const serviceAccountListSchema = z.object({
  serviceAccounts: z.array(serviceAccountSchema),
});

export type ServiceAccountList = z.infer<typeof serviceAccountListSchema>;

export const createdServiceAccountSchema = z.object({
  serviceAccount: serviceAccountSchema,
  apiKey: issuedApiKeySchema,
});

export type CreatedServiceAccount = z.infer<typeof createdServiceAccountSchema>;

/** Who an API key speaks for, as routes see it. */
export const agentCallerSchema = z.object({
  principalId: z.uuid(),
  keyId: z.string(),
  scopes: z.array(apiKeyScopeSchema),
  account: z.discriminatedUnion('kind', [
    z.object({ kind: z.literal('bench'), benchId: z.string() }),
    z.object({ kind: z.literal('agent'), agentName: z.string() }),
  ]),
});

export type AgentCaller = z.infer<typeof agentCallerSchema>;
