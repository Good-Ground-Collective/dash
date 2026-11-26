import { describe, expect, it } from 'vitest';

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
