import { describe, expect, it } from 'vitest';

import { servicePrincipalSchema } from '#src/auth/contracts/principal.ts';
import { apiKeyScopes } from '#src/auth/definitions/api-key-scopes/api-key-scopes.ts';

describe('TypedApiKeyScopeRegistry', () => {
  it('turns scopes into the plugin’s statements and back', () => {
    const statements = apiKeyScopes.toStatements([
      'heartbeat:write',
      'telemetry:write',
      'heartbeat:write',
    ]);

    expect(statements).toEqual({
      heartbeat: ['write'],
      telemetry: ['write'],
    });
    expect(apiKeyScopes.fromStatements(statements)).toEqual([
      'heartbeat:write',
      'telemetry:write',
    ]);
  });

  it('grants nothing for statements it doesn’t know', () => {
    expect(
      apiKeyScopes.fromStatements({ heartbeat: ['read'], admin: ['write'] }),
    ).toEqual([]);
    expect(apiKeyScopes.fromStatements(null)).toEqual([]);
  });
});

describe('storedApiKeyScopesSchema', () => {
  it('keeps an account holding a retired scope readable, granting only known scopes', () => {
    const principal = servicePrincipalSchema.parse({
      id: '0b6a3c3e-4f7e-4c1c-9a57-2a7f3d1f0c11',
      email: 'svc-0b6a3c3e@service.invalid',
      name: 'Studio Mac',
      ownerUserId: '5d2f1c9a-3b4e-4f6a-8c7d-9e0f1a2b3c4d',
      benchId: 'studio-mac',
      agentName: null,
      description: 'The desk machine',
      scopes: ['heartbeat:write', 'retired:write'],
      createdAt: '2026-11-26T18:00:00.000Z',
    });

    expect(principal.scopes).toEqual(['heartbeat:write']);
  });
});
