import { z } from 'zod';

import {
  apiKeyScopeSchema,
  storedApiKeyScopesSchema,
} from '#src/auth/definitions/api-key-scopes/api-key-scopes.ts';
import {
  characterHueSchema,
  storedCharacterHueSchema,
} from '#src/auth/definitions/character-hues/character-hues.ts';

export const principalKindSchema = z
  .enum(['user', 'service'])
  .describe(
    'A `user` is a person who signs in with a passkey. A `service` is a bench or agent that authenticates with an API key and never holds a web session.',
  );

export type PrincipalKind = z.infer<typeof principalKindSchema>;

/** Reserved by RFC 2606, so synthetic service principal emails can never be delivered. */
export const serviceEmailDomain = 'service.invalid';

export const newServicePrincipalSchema = z
  .object({
    name: z.string().trim().min(1),
    ownerUserId: z.uuid().describe('The human principal accountable for it.'),
    benchId: z
      .string()
      .trim()
      .min(1)
      .optional()
      .describe('Set for a bench account. Unset for an agent account.'),
    agentName: z
      .string()
      .trim()
      .min(1)
      .optional()
      .describe('Set for an agent account. Unset for a bench account.'),
    description: z.string().trim().min(1),
    hue: characterHueSchema
      .optional()
      .describe('Unset picks one from the bench id or agent name.'),
    scopes: z
      .array(apiKeyScopeSchema)
      .default([])
      .describe('The most its API keys may do. Every key gets these.'),
  })
  .refine(
    (principal) =>
      (principal.benchId === undefined) !== (principal.agentName === undefined),
    {
      message: 'Set exactly one of benchId (a bench) and agentName (an agent)',
    },
  );

export type NewServicePrincipal = z.input<typeof newServicePrincipalSchema>;

export const servicePrincipalSchema = z.object({
  id: z.uuid(),
  email: z
    .email()
    .describe('Synthetic and non-routable: `svc-<id>@service.invalid`.'),
  name: z.string(),
  ownerUserId: z.uuid(),
  benchId: z.string().nullable(),
  agentName: z.string().nullable(),
  description: z.string(),
  hue: storedCharacterHueSchema,
  scopes: storedApiKeyScopesSchema,
  createdAt: z.iso.datetime({ offset: true }),
});

export type ServicePrincipal = z.infer<typeof servicePrincipalSchema>;
